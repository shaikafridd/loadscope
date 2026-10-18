import type { RunOptions, RunSummary } from "./types.js";

export * from "./types.js";

/**
 * Programmatic API to execute a load test run.
 */
export async function run(options: RunOptions): Promise<RunSummary> {
  // Phase 0 placeholder: returns an initial summary stub
  return {
    target: options.url,
    rps: 0,
    totalRequests: 0,
    durationSec: options.duration ?? 10,
    p50: 0,
    p95: 0,
    p99: 0,
    errorRate: 0,
    statusCodes: {},
    series: [],
  };
}
