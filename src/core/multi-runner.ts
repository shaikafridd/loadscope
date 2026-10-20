import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Histogram } from "../stats/histogram.js";
import { LiveDashboard } from "../report/dashboard.js";
import { extractDistribution, computeQueueDelay } from "../stats/co-corrector.js";
import { resolveWorkerCount, type ValidatedRunOptions } from "../config/schema.js";
import type {
  RunSummary,
  LatencyPoint,
  WorkerInitData,
  WorkerMessage,
  WorkerDoneMessage,
  WorkerTickMessage,
} from "../types.js";

/**
 * Resolves the location of worker.js/worker.ts across dev, test, and bundled environments.
 */
function getWorkerPath(): { path: string; execArgv?: string[] } {
  // If compiled dist/worker.js exists (built by tsup in CI/prod), prefer it for pure native execution
  const distCandidate = path.resolve(process.cwd(), "dist/worker.js");
  if (fs.existsSync(distCandidate)) {
    return { path: distCandidate };
  }

  const currentFile = fileURLToPath(import.meta.url);
  const dir = path.dirname(currentFile);

  const candidate1 = path.resolve(dir, "worker.js");
  if (fs.existsSync(candidate1)) return { path: candidate1 };

  const candidate2 = path.resolve(dir, "../worker.js");
  if (fs.existsSync(candidate2)) return { path: candidate2 };

  if (currentFile.endsWith(".ts")) {
    const tsWorker = path.resolve(dir, "worker.ts");
    return { path: tsWorker, execArgv: ["--import", "tsx"] };
  }

  return { path: distCandidate };
}

/**
 * Execute a multi-threaded load test across worker threads.
 * Partitions concurrency and arrival rate across W workers, merges their
 * log-bucketed histogram snapshots in O(B) time, and updates the live dashboard.
 */
export async function executeMultiThreaded(options: ValidatedRunOptions): Promise<RunSummary> {
  const workerCount = resolveWorkerCount(options.workers, options.concurrency);
  const targetMode = options.rate && options.rate > 0 ? "open" : (options.mode ?? "closed");

  const baseConcurrency = Math.floor(options.concurrency / workerCount);
  const extraConcurrency = options.concurrency % workerCount;
  const ratePerWorker = options.rate && options.rate > 0 ? options.rate / workerCount : undefined;

  const globalHistogram = new Histogram();
  const globalServiceHistogram = new Histogram();
  const globalTtfbHistogram = new Histogram();
  const aggregatedStatusCodes: Record<number, number> = {};
  const aggregatedErrorsByType: Record<string, number> = {};
  const selfCheckWarnings: string[] = [];
  const series: LatencyPoint[] = [];

  const workerLagMax: number[] = [];
  const workerLagP99: number[] = [];

  let currentSecondWindowHistogram = new Histogram();

  const dashboard = new LiveDashboard(options.dashboard);
  const { path: workerScript, execArgv } = getWorkerPath();

  const startNs = process.hrtime.bigint();
  let lastRecordedSec = 0;

  const latestTicks = new Map<number, WorkerTickMessage>();
  const doneMessages: WorkerDoneMessage[] = [];

  const workerPromises: Promise<void>[] = [];

  for (let i = 0; i < workerCount; i++) {
    const workerConcurrency = baseConcurrency + (i < extraConcurrency ? 1 : 0);

    const initData: WorkerInitData = {
      workerIndex: i,
      totalWorkers: workerCount,
      url: options.url,
      duration: options.duration,
      concurrency: workerConcurrency,
      rate: ratePerWorker,
      distribution: options.distribution,
      honest: options.honest,
      ttfb: options.ttfb,
      method: options.method,
      headers: options.headers,
      body: options.body,
      timeout: options.timeout,
      warmup: options.warmup ?? 0,
      rampUp: options.rampUp ?? 0,
      mode: targetMode,
    };

    const promise = new Promise<void>((resolve, reject) => {
      const worker = new Worker(workerScript, {
        workerData: initData,
        execArgv: execArgv ?? [],
      });

      worker.on("message", (msg: WorkerMessage) => {
        if (msg.type === "tick") {
          latestTicks.set(msg.workerIndex, msg);
          currentSecondWindowHistogram.mergeSnapshot(msg.windowSnapshot);

          let liveDispatched = 0;
          let liveNetworkErrors = 0;
          let liveHttpErrors = 0;
          const liveMergedHist = new Histogram();

          for (const t of latestTicks.values()) {
            liveDispatched += t.dispatched;
            liveNetworkErrors += t.networkErrors;
            liveHttpErrors += t.httpErrors;
            liveMergedHist.mergeSnapshot(t.cumulativeSnapshot);
          }

          const elapsedSec = Math.floor(Number(process.hrtime.bigint() - startNs) / 1_000_000_000);
          const currentRps = elapsedSec > 0 ? liveDispatched / elapsedSec : 0;

          if (elapsedSec > lastRecordedSec) {
            lastRecordedSec = elapsedSec;
            series.push({
              t: elapsedSec,
              p95: currentSecondWindowHistogram.total > 0 ? currentSecondWindowHistogram.percentileMs(95) : liveMergedHist.percentileMs(95),
            });
            currentSecondWindowHistogram = new Histogram();
          }

          dashboard.update({
            target: options.url,
            elapsedSec,
            totalDurationSec: options.duration,
            totalRequests: liveDispatched,
            currentRps,
            p50Ms: liveMergedHist.percentileMs(50),
            p90Ms: liveMergedHist.percentileMs(90),
            p95Ms: liveMergedHist.percentileMs(95),
            networkErrors: liveNetworkErrors,
            httpErrors: liveHttpErrors,
            workerCount,
            mode: targetMode,
          });
        } else if (msg.type === "done") {
          doneMessages.push(msg);
          workerLagMax.push(msg.loopLagMaxMs);
          workerLagP99.push(msg.loopLagP99Ms);
        } else if (msg.type === "error") {
          reject(new Error(`Worker ${msg.workerIndex} encountered error: ${msg.error}`));
        }
      });

      worker.on("error", reject);
      worker.on("exit", (code) => {
        if (code !== 0 && doneMessages.length < workerCount) {
          reject(new Error(`Worker ${i} exited with non-zero code ${code}`));
        } else {
          resolve();
        }
      });
    });

    workerPromises.push(promise);
  }

  try {
    await Promise.all(workerPromises);
  } finally {
    dashboard.stop();
  }

  let totalDispatched = 0;
  let networkErrors = 0;
  let httpErrors = 0;

  for (const done of doneMessages) {
    totalDispatched += done.dispatched;
    networkErrors += done.networkErrors;
    httpErrors += done.httpErrors;

    globalHistogram.mergeSnapshot(done.finalSnapshot);
    if (done.serviceTimeSnapshot) {
      globalServiceHistogram.mergeSnapshot(done.serviceTimeSnapshot);
    }
    if (done.ttfbSnapshot) {
      globalTtfbHistogram.mergeSnapshot(done.ttfbSnapshot);
    }

    for (const [code, count] of Object.entries(done.statusCodes)) {
      const numCode = Number(code);
      aggregatedStatusCodes[numCode] = (aggregatedStatusCodes[numCode] || 0) + count;
    }

    for (const [errType, count] of Object.entries(done.errorsByType)) {
      aggregatedErrorsByType[errType] = (aggregatedErrorsByType[errType] || 0) + count;
    }
  }

  const maxLag = workerLagMax.length > 0 ? Math.max(...workerLagMax) : 0;
  const maxP99Lag = workerLagP99.length > 0 ? Math.max(...workerLagP99) : 0;
  if (maxP99Lag > 20 || maxLag > 50) {
    selfCheckWarnings.push(
      `Worker event loop lag detected (highest worker max: ${maxLag.toFixed(1)}ms, p99: ${maxP99Lag.toFixed(1)}ms). Load generator event loop was under heavy load.`
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
      p95: globalHistogram.percentileMs(95),
    });
  }

  const responseDist = extractDistribution(globalHistogram);
  const hasService = globalServiceHistogram.total > 0;
  const serviceDist = hasService ? extractDistribution(globalServiceHistogram) : undefined;
  const queueDelayDist = serviceDist ? computeQueueDelay(responseDist, serviceDist) : undefined;
  const ttfbDist = globalTtfbHistogram.total > 0 && options.ttfb ? extractDistribution(globalTtfbHistogram) : undefined;

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
    statusCodes: aggregatedStatusCodes,
    errorsByType: aggregatedErrorsByType,
    series,
    selfCheckWarnings,
    workerCount,
    distribution: options.distribution,
    serviceTime: serviceDist,
    queueDelay: queueDelayDist,
    ttfb: ttfbDist,
  };
}
