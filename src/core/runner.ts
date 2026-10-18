import { Pool } from "undici";
import { Histogram } from "../stats/histogram.js";
import type { ValidatedRunOptions } from "../config/schema.js";
import type { RunSummary, LatencyPoint } from "../types.js";

/**
 * Execute a single-threaded closed-model load test using undici.Pool.
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
  const statusCodes: Record<number, number> = {};
  let errorCount = 0;
  const series: LatencyPoint[] = [];

  const durationNs = BigInt(Math.floor(options.duration * 1_000_000_000));
  const startNs = process.hrtime.bigint();
  const endNs = startNs + durationNs;

  let stopped = false;

  // Snapshot timer: record p95 once every second (max 60 points)
  let lastSecond = 0;
  const timer = setInterval(() => {
    const elapsedSec = Math.floor(Number(process.hrtime.bigint() - startNs) / 1_000_000_000);
    if (elapsedSec > lastSecond && series.length < 60) {
      lastSecond = elapsedSec;
      series.push({
        t: elapsedSec,
        p95: histogram.percentileMs(95),
      });
    }
  }, 1000);

  // Worker loop representing a single virtual user connection
  async function workerLoop(): Promise<void> {
    const reqPath = urlObj.pathname + urlObj.search;
    const reqMethod = options.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

    while (!stopped) {
      const nowNs = process.hrtime.bigint();
      if (nowNs >= endNs) {
        stopped = true;
        break;
      }

      const reqStartNs = process.hrtime.bigint();
      try {
        const response = await pool.request({
          path: reqPath,
          method: reqMethod,
          headers: options.headers,
          body: options.body,
        });

        // Fast discard of response body to release the socket back to pool
        await response.body.dump();

        const elapsedUs = Number(process.hrtime.bigint() - reqStartNs) / 1000;
        histogram.record(elapsedUs);

        const code = response.statusCode;
        statusCodes[code] = (statusCodes[code] || 0) + 1;
      } catch {
        errorCount++;
      }
    }
  }

  try {
    // Launch N concurrent worker loops
    const workers = Array.from({ length: options.concurrency }, () => workerLoop());
    await Promise.all(workers);
  } finally {
    clearInterval(timer);
    await pool.close();
  }

  const totalNs = process.hrtime.bigint() - startNs;
  const totalDurationSec = Number(totalNs) / 1_000_000_000;
  const completedRequests = histogram.total;
  const totalDispatched = completedRequests + errorCount;
  const rps = totalDurationSec > 0 ? completedRequests / totalDurationSec : 0;
  const errorRate = totalDispatched > 0 ? errorCount / totalDispatched : 0;

  // Ensure at least one series point is recorded
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
    p95: histogram.percentileMs(95),
    p99: histogram.percentileMs(99),
    errorRate,
    statusCodes,
    series,
  };
}
