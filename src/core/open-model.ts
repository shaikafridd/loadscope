import { Pool } from "undici";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Histogram } from "../stats/histogram.js";
import { ArrivalScheduler } from "./scheduler.js";
import { recordWithCorrection, extractDistribution, computeQueueDelay } from "../stats/co-corrector.js";
import type { ValidatedRunOptions } from "../config/schema.js";
import type { RunSummary, LatencyPoint } from "../types.js";

/**
 * Execute an open-model load test using undici.Pool.
 *
 * In the open arrival model, requests are scheduled at target arrival times
 * independent of whether previous requests have completed (Uniform or Poisson process).
 * Latency is measured from the INTENDED dispatch timestamp to completion timestamp,
 * directly revealing client-side queueing delay and eliminating Coordinated Omission.
 */
export async function executeOpenModel(options: ValidatedRunOptions): Promise<RunSummary> {
  const targetRps = options.rate && options.rate > 0 ? options.rate : 50;
  const distribution = options.distribution ?? "uniform";
  const expectedIntervalUs = (1 / targetRps) * 1_000_000;

  // Max concurrent connections pool
  const maxConnections = Math.max(options.concurrency, Math.min(500, Math.ceil(targetRps * 2)));
  const urlObj = new URL(options.url);
  const pool = new Pool(urlObj.origin, {
    connections: maxConnections,
    pipelining: 1,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });

  const responseHistogram = new Histogram(); // Honest latency: completionNs - intendedNs
  const serviceHistogram = new Histogram();  // Pure server time: completionNs - dispatchNs
  const ttfbHistogram = new Histogram();     // Time to first byte: headersNs - dispatchNs
  let currentSecondHistogram = new Histogram();

  const statusCodes: Record<number, number> = {};
  const errorsByType: Record<string, number> = {};
  const selfCheckWarnings: string[] = [];
  const series: LatencyPoint[] = [];

  let networkErrors = 0;
  let httpErrors = 0;
  let totalDispatched = 0;

  const timeoutMs = Math.max(1, Math.floor(options.timeout * 1000));
  const reqPath = urlObj.pathname + urlObj.search;
  const reqMethod = options.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  let stopped = false;
  const abortController = new AbortController();

  async function dispatchRequest(intendedNs: bigint, recordStats: boolean): Promise<void> {
    if (recordStats) totalDispatched++;
    const dispatchNs = process.hrtime.bigint();

    try {
      const response = await pool.request({
        path: reqPath,
        method: reqMethod,
        headers: options.headers,
        body: options.body,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
        signal: abortController.signal,
      });

      // Headers arrived: record TTFB
      const headersNs = process.hrtime.bigint();
      const ttfbUs = Math.max(0, Number(headersNs - dispatchNs) / 1000);

      await response.body.dump({ limit: 10 * 1024 * 1024 });

      const completionNs = process.hrtime.bigint();
      const serviceUs = Math.max(0, Number(completionNs - dispatchNs) / 1000);
      const honestResponseUs = Math.max(0, Number(completionNs - intendedNs) / 1000);
      const code = response.statusCode;

      if (recordStats) {
        if (options.honest) {
          recordWithCorrection(responseHistogram, honestResponseUs, expectedIntervalUs);
          recordWithCorrection(serviceHistogram, serviceUs, expectedIntervalUs);
        } else {
          responseHistogram.record(honestResponseUs);
          serviceHistogram.record(serviceUs);
        }

        ttfbHistogram.record(ttfbUs);
        currentSecondHistogram.record(honestResponseUs);
        statusCodes[code] = (statusCodes[code] || 0) + 1;
        if (code >= 400) {
          httpErrors++;
        }
      }
    } catch (err: unknown) {
      const completionNs = process.hrtime.bigint();
      const serviceUs = Math.max(0, Number(completionNs - dispatchNs) / 1000);
      const honestResponseUs = Math.max(0, Number(completionNs - intendedNs) / 1000);

      if (recordStats) {
        networkErrors++;
        responseHistogram.record(honestResponseUs);
        serviceHistogram.record(serviceUs);
        currentSecondHistogram.record(honestResponseUs);

        const errorObj = err as { code?: string; name?: string };
        const codeKey = errorObj.code || errorObj.name || "NETWORK_ERROR";
        errorsByType[codeKey] = (errorsByType[codeKey] || 0) + 1;
      }
    }
  }

  // Optional Warmup
  if (options.warmup && options.warmup > 0) {
    const warmupScheduler = new ArrivalScheduler(targetRps, distribution);
    const warmupDurationNs = BigInt(Math.floor(options.warmup * 1_000_000_000));
    const warmupStartNs = process.hrtime.bigint();
    const warmupEndNs = warmupStartNs + warmupDurationNs;

    while (process.hrtime.bigint() < warmupEndNs && !stopped) {
      const targetNs = warmupScheduler.nextArrivalNs();
      await warmupScheduler.waitUntil(targetNs);
      void dispatchRequest(targetNs, false);
    }
  }

  // Measurement Phase
  const durationNs = BigInt(Math.floor(options.duration * 1_000_000_000));
  const startNs = process.hrtime.bigint();
  const endNs = startNs + durationNs;

  const scheduler = new ArrivalScheduler(targetRps, distribution, startNs);

  const hardDeadlineTimer = setTimeout(() => {
    stopped = true;
    abortController.abort();
  }, Math.ceil(options.duration * 1000) + 300);

  let lastSecond = 0;
  const snapshotTimer = setInterval(() => {
    const elapsedSec = Math.floor(Number(process.hrtime.bigint() - startNs) / 1_000_000_000);
    if (elapsedSec > lastSecond) {
      lastSecond = elapsedSec;
      series.push({
        t: elapsedSec,
        p95: currentSecondHistogram.total > 0 ? currentSecondHistogram.percentileMs(95) : responseHistogram.percentileMs(95),
      });
      currentSecondHistogram = new Histogram();
    }
  }, 1000);

  const pendingPromises: Set<Promise<void>> = new Set();

  while (!stopped) {
    const nowNs = process.hrtime.bigint();
    if (nowNs >= endNs) {
      stopped = true;
      break;
    }

    const targetArrivalNs = scheduler.nextArrivalNs();
    await scheduler.waitUntil(targetArrivalNs);

    const p = dispatchRequest(targetArrivalNs, true);
    pendingPromises.add(p);
    p.finally(() => pendingPromises.delete(p));

    if (pendingPromises.size > maxConnections * 2) {
      await Promise.race(pendingPromises);
    }
  }

  await Promise.allSettled(Array.from(pendingPromises));

  clearTimeout(hardDeadlineTimer);
  clearInterval(snapshotTimer);
  loopDelay.disable();
  await pool.close();

  const maxLoopLagMs = loopDelay.max / 1_000_000;
  const p99LoopLagMs = loopDelay.percentile(99) / 1_000_000;
  if (p99LoopLagMs > 20 || maxLoopLagMs > 50) {
    selfCheckWarnings.push(
      `Event loop lag detected (max: ${maxLoopLagMs.toFixed(1)}ms, p99: ${p99LoopLagMs.toFixed(1)}ms). The runner's event loop may be saturated, adding client-side queue delay.`
    );
  }

  if (scheduler.averageDriftMs > 10) {
    selfCheckWarnings.push(
      `High schedule drift detected (avg drift: ${scheduler.averageDriftMs.toFixed(1)}ms). The client could not maintain the target ${targetRps} req/s arrival rate.`
    );
  }

  const totalNs = process.hrtime.bigint() - startNs;
  const totalDurationSec = Math.max(0.001, Number(totalNs) / 1_000_000_000);
  const rps = totalDurationSec > 0 ? totalDispatched / totalDurationSec : 0;
  const totalFailures = networkErrors + httpErrors;
  const errorRate = totalDispatched > 0 ? totalFailures / totalDispatched : 0;

  if (series.length === 0) {
    series.push({
      t: Math.max(1, Math.round(totalDurationSec)),
      p95: responseHistogram.percentileMs(95),
    });
  }

  const serviceDist = extractDistribution(serviceHistogram);
  const responseDist = extractDistribution(responseHistogram);
  const queueDelayDist = computeQueueDelay(responseDist, serviceDist);
  const ttfbDist = extractDistribution(ttfbHistogram);

  return {
    target: options.url,
    rps,
    totalRequests: totalDispatched,
    durationSec: totalDurationSec,
    p50: responseDist.p50,
    p90: responseDist.p90,
    p95: responseDist.p95,
    p99: responseDist.p99,
    errorRate,
    networkErrors,
    httpErrors,
    statusCodes,
    errorsByType,
    series,
    selfCheckWarnings,
    distribution,
    serviceTime: serviceDist,
    queueDelay: queueDelayDist,
    ttfb: options.ttfb ? ttfbDist : undefined,
    scheduleDriftMs: scheduler.averageDriftMs,
  };
}
