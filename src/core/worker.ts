import { parentPort, workerData } from "node:worker_threads";
import { Pool } from "undici";
import { monitorEventLoopDelay } from "node:perf_hooks";
import { Histogram } from "../stats/histogram.js";
import type { WorkerInitData, WorkerTickMessage, WorkerDoneMessage } from "../types.js";

async function runWorker(): Promise<void> {
  const data = workerData as WorkerInitData;
  if (!data || !parentPort) return;

  const urlObj = new URL(data.url);
  const pool = new Pool(urlObj.origin, {
    connections: Math.max(1, data.concurrency),
    pipelining: 1,
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
  });

  const histogram = new Histogram();
  let currentSecondHistogram = new Histogram();
  const statusCodes: Record<number, number> = {};
  const errorsByType: Record<string, number> = {};

  let networkErrors = 0;
  let httpErrors = 0;
  let dispatched = 0;

  const timeoutMs = Math.max(1, Math.floor(data.timeout * 1000));
  const reqPath = urlObj.pathname + urlObj.search;
  const reqMethod = data.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS";

  const loopDelay = monitorEventLoopDelay({ resolution: 20 });
  loopDelay.enable();

  let stopped = false;
  const abortController = new AbortController();

  async function dispatchRequest(intendedNs: bigint, recordStats: boolean): Promise<void> {
    if (recordStats) dispatched++;
    const reqStartNs = process.hrtime.bigint();

    try {
      const response = await pool.request({
        path: reqPath,
        method: reqMethod,
        headers: data.headers,
        body: data.body,
        headersTimeout: timeoutMs,
        bodyTimeout: timeoutMs,
        signal: abortController.signal,
      });

      await response.body.dump({ limit: 10 * 1024 * 1024 });

      const completionNs = process.hrtime.bigint();
      const baseNs = data.mode === "open" ? intendedNs : reqStartNs;
      const elapsedUs = Math.max(0, Number(completionNs - baseNs) / 1000);
      const code = response.statusCode;

      if (recordStats) {
        histogram.record(elapsedUs);
        currentSecondHistogram.record(elapsedUs);
        statusCodes[code] = (statusCodes[code] || 0) + 1;
        if (code >= 400) {
          httpErrors++;
        }
      }
    } catch (err: unknown) {
      const completionNs = process.hrtime.bigint();
      const baseNs = data.mode === "open" ? intendedNs : reqStartNs;
      const elapsedUs = Math.max(0, Number(completionNs - baseNs) / 1000);

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
  if (data.warmup > 0) {
    const warmupEndNs = process.hrtime.bigint() + BigInt(Math.floor(data.warmup * 1_000_000_000));
    let warmupStopped = false;

    const warmupWorkers = Array.from({ length: Math.max(1, data.concurrency) }, async () => {
      while (!warmupStopped && !stopped) {
        if (process.hrtime.bigint() >= warmupEndNs) {
          warmupStopped = true;
          break;
        }
        await dispatchRequest(process.hrtime.bigint(), false);
      }
    });

    await Promise.all(warmupWorkers);
  }

  // Measurement Phase
  const durationNs = BigInt(Math.floor(data.duration * 1_000_000_000));
  const startNs = process.hrtime.bigint();
  const endNs = startNs + durationNs;

  const hardDeadlineTimer = setTimeout(() => {
    stopped = true;
    abortController.abort();
  }, Math.ceil(data.duration * 1000) + 300);

  let lastSecond = 0;
  const tickTimer = setInterval(() => {
    const elapsedSec = Math.floor(Number(process.hrtime.bigint() - startNs) / 1_000_000_000);
    if (elapsedSec > lastSecond) {
      lastSecond = elapsedSec;
      const tickMsg: WorkerTickMessage = {
        type: "tick",
        workerIndex: data.workerIndex,
        elapsedSec,
        dispatched,
        networkErrors,
        httpErrors,
        statusCodes: { ...statusCodes },
        errorsByType: { ...errorsByType },
        windowSnapshot: currentSecondHistogram.toSnapshot(),
        cumulativeSnapshot: histogram.toSnapshot(),
        loopLagMs: loopDelay.percentile(99) / 1_000_000,
      };
      parentPort?.postMessage(tickMsg);
      currentSecondHistogram = new Histogram();
    }
  }, 1000);

  if (data.mode === "open" && data.rate && data.rate > 0) {
    const intervalNs = BigInt(Math.floor(1_000_000_000 / data.rate));
    let seq = 0n;
    const pendingPromises: Set<Promise<void>> = new Set();

    while (!stopped) {
      const nowNs = process.hrtime.bigint();
      if (nowNs >= endNs) {
        stopped = true;
        break;
      }

      const intendedNs = startNs + seq * intervalNs;
      seq++;

      if (nowNs < intendedNs) {
        const sleepMs = Number(intendedNs - nowNs) / 1_000_000;
        if (sleepMs > 1) {
          await new Promise((r) => setTimeout(r, sleepMs));
        }
      }

      const p = dispatchRequest(intendedNs, true);
      pendingPromises.add(p);
      p.finally(() => pendingPromises.delete(p));

      if (pendingPromises.size > Math.max(10, data.concurrency * 2)) {
        await Promise.race(pendingPromises);
      }
    }

    await Promise.allSettled(Array.from(pendingPromises));
  } else {
    async function workerLoop(idx: number): Promise<void> {
      if (data.rampUp > 0) {
        const delayMs = (idx / data.concurrency) * data.rampUp * 1000;
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      while (!stopped) {
        if (process.hrtime.bigint() >= endNs) {
          stopped = true;
          break;
        }
        await dispatchRequest(process.hrtime.bigint(), true);
      }
    }

    const workers = Array.from({ length: Math.max(1, data.concurrency) }, (_, i) => workerLoop(i));
    await Promise.all(workers);
  }

  clearTimeout(hardDeadlineTimer);
  clearInterval(tickTimer);
  loopDelay.disable();
  await pool.close();

  const doneMsg: WorkerDoneMessage = {
    type: "done",
    workerIndex: data.workerIndex,
    dispatched,
    networkErrors,
    httpErrors,
    statusCodes,
    errorsByType,
    finalSnapshot: histogram.toSnapshot(),
    loopLagMaxMs: loopDelay.max / 1_000_000,
    loopLagP99Ms: loopDelay.percentile(99) / 1_000_000,
  };
  parentPort?.postMessage(doneMsg);
}

runWorker().catch((err) => {
  const errorMsg = err instanceof Error ? err.stack || err.message : String(err);
  parentPort?.postMessage({
    type: "error",
    workerIndex: (workerData as WorkerInitData)?.workerIndex ?? -1,
    error: errorMsg,
  });
});
