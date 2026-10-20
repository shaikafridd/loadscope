import { validateRunOptions, resolveWorkerCount } from "./config/schema.js";
import { executeClosedModel } from "./core/runner.js";
import { executeOpenModel } from "./core/open-model.js";
import { executeMultiThreaded } from "./core/multi-runner.js";
import type { RunOptions, RunSummary } from "./types.js";

export * from "./types.js";
export { Histogram } from "./stats/histogram.js";
export { formatTerminalReport, printTerminalReport } from "./report/terminal.js";
export { formatJsonReport, formatCsvReport } from "./report/export.js";
export { LiveDashboard } from "./report/dashboard.js";
export { executeClosedModel } from "./core/runner.js";
export { executeOpenModel } from "./core/open-model.js";
export { executeMultiThreaded } from "./core/multi-runner.js";
export { ArrivalScheduler } from "./core/scheduler.js";
export { recordWithCorrection, extractDistribution, computeQueueDelay } from "./stats/co-corrector.js";

/**
 * Programmatic API to execute a load test run.
 * Automatically delegates to multi-threaded execution when workers > 1,
 * open arrival model when rate is specified, or single-threaded closed concurrency.
 */
export async function run(options: RunOptions): Promise<RunSummary> {
  const validated = validateRunOptions(options);

  const workerCount = resolveWorkerCount(validated.workers, validated.concurrency);
  if (workerCount > 1) {
    return executeMultiThreaded(validated);
  }

  if (validated.mode === "open" || (validated.rate !== undefined && validated.rate > 0 && validated.mode !== "closed")) {
    return executeOpenModel(validated);
  }

  return executeClosedModel(validated);
}
