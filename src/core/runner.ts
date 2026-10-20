import { Pool } from "undici";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Histogram } from "../stats/histogram.js";
import { recordWithCorrection, extractDistribution } from "../stats/co-corrector.js";
import type { ValidatedRunOptions } from "../config/schema.js";
import type { RunSummary, LatencyPoint } from "../types.js";

/**
 * Execute a closed-model load test using undici.Pool.
 *
 * In the closed model, concurrency is fixed: exactly `concurrency` parallel
 * workers loop, each dispatching the next request as soon as the previous finishes.
 */
export async function executeClosedModel(options: ValidatedRunOptions): Promise<RunSummary> {
  const urlObj = new URL(options.url);
  const pool = new Pool(urlObj.origin, {
    connections: options.concurrency,
    pipelining: 1,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });

  const histogram = new Histogram();
  const ttfbHistogram = new Histogram();
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

  // Monitor Node event loop delay to detect load generator saturation
  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  let stopped = false;
  const abortController = new AbortController();

  // Helper to execute single request
  async function dispatchRequest(recordStats: boolean): Promise<void> {
    if (recordStats) totalDispatched++;
    const reqStartNs = process.hrtime.bigint();

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

      // Headers arrived: TTFB
      const headersNs = process.hrtime.bigint();
      const ttfbUs = Math.max(0, Number(headersNs - reqStartNs) / 1000);

      // Discard response body up to 10MB without destroying socket connection
      await response.body.dump({ limit: 10 * 1024 * 1024 });

      const elapsedUs = Number(process.hrtime.bigint() - reqStartNs) / 1000;
      const code = response.statusCode;

      if (recordStats) {
        if (options.honest) {
          // Expected interval based on concurrency target
          const expectedIntervalUs = (10 / options.concurrency) * 1000;
          recordWithCorrection(histogram, elapsedUs, expectedIntervalUs);
        } else {
          histogram.record(elapsedUs);
        }

        ttfbHistogram.record(ttfbUs);
        currentSecondHistogram.record(elapsedUs);
        statusCodes[code] = (statusCodes[code] || 0) + 1;
        if (code >= 400) {
          httpErrors++;
        }
      }
    } catch (err: unknown) {
      const elapsedUs = Number(process.hrtime.bigint() - reqStartNs) / 1000;
      if (recordStats) {
        networkErrors++;
        histogram.record(elapsedUs);
        currentSecondHistogram.record(elapsedUs);

        const errorObj = err as { code?: string; name?: string };
        const codeKey = errorObj.code || errorObj.name || "NETWORK_ERROR";
        errorsByType[codeKey] = (errorsByType[codeKey] || 0) + 1;
      }
    }
  }

  // Optional Warmup Phase
  if (options.warmup && options.warmup > 0) {
    const warmupEndNs = process.hrtime.bigint() + BigInt(Math.floor(options.warmup * 1_000_000_000));
    let warmupStopped = false;

    const warmupWorkers = Array.from({ length: options.concurrency }, async () => {
      while (!warmupStopped && !stopped) {
        if (process.hrtime.bigint() >= warmupEndNs) {
          warmupStopped = true;
          break;
        }
        await dispatchRequest(false);
      }
    });

    await Promise.all(warmupWorkers);
  }

  // Measurement Phase
  const durationNs = BigInt(Math.floor(options.duration * 1_000_000_000));
  const startNs = process.hrtime.bigint();
  const endNs = startNs + durationNs;

  const hardDeadlineTimer = setTimeout(() => {
    stopped = true;
    abortController.abort();
  }, Math.ceil(options.duration * 1000) + 200);

  let lastSecond = 0;
  const snapshotTimer = setInterval(() => {
    const elapsedSec = Math.floor(Number(process.hrtime.bigint() - startNs) / 1_000_000_000);
    if (elapsedSec > lastSecond) {
      lastSecond = elapsedSec;
      series.push({
        t: elapsedSec,
        p95: currentSecondHistogram.total > 0 ? currentSecondHistogram.percentileMs(95) : histogram.percentileMs(95),
      });
      currentSecondHistogram = new Histogram();
    }
  }, 1000);

  async function workerLoop(workerIndex: number): Promise<void> {
    if (options.rampUp && options.rampUp > 0) {
      const delayMs = (workerIndex / options.concurrency) * options.rampUp * 1000;
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    while (!stopped) {
      if (process.hrtime.bigint() >= endNs) {
        stopped = true;
        break;
      }
      await dispatchRequest(true);
    }
  }

  try {
    const workers = Array.from({ length: options.concurrency }, (_, i) => workerLoop(i));
    await Promise.all(workers);
  } finally {
    clearTimeout(hardDeadlineTimer);
    clearInterval(snapshotTimer);
    loopDelay.disable();
    await pool.close();
  }

  const maxLoopLagMs = loopDelay.max / 1_000_000;
  const p99LoopLagMs = loopDelay.percentile(99) / 1_000_000;
  if (p99LoopLagMs > 20 || maxLoopLagMs > 50) {
    selfCheckWarnings.push(
      `Event loop lag detected (max: ${maxLoopLagMs.toFixed(1)}ms, p99: ${p99LoopLagMs.toFixed(1)}ms). The runner's event loop may be saturated, adding client-side queue delay.`
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
      p95: histogram.percentileMs(95),
    });
  }

  return {
    target: options.url,
    rps,
    totalRequests: totalDispatched,
    durationSec: totalDurationSec,
    p50: histogram.percentileMs(50),
    p90: histogram.percentileMs(90),
    p95: histogram.percentileMs(95),
    p99: histogram.percentileMs(99),
    errorRate,
    networkErrors,
    httpErrors,
    statusCodes,
    errorsByType,
    series,
    selfCheckWarnings,
    ttfb: options.ttfb ? extractDistribution(ttfbHistogram) : undefined,
  };
}
