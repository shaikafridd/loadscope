import { validateRunOptions } from "./config/schema.js";
import { executeClosedModel } from "./core/runner.js";
import type { RunOptions, RunSummary } from "./types.js";

export * from "./types.js";
export { Histogram } from "./stats/histogram.js";

/**
 * Programmatic API to execute a load test run.
 */
export async function run(options: RunOptions): Promise<RunSummary> {
  const validated = validateRunOptions(options);
  return executeClosedModel(validated);
}
