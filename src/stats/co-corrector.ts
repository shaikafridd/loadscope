import { Histogram } from "./histogram.js";
import type { LatencyDistribution } from "../types.js";

/**
 * Gil Tene's Coordinated Omission Correction algorithm (from wrk2 / HdrHistogram).
 *
 * In load testing, when a request stalls or experiences high latency L exceeding
 * the expected inter-arrival interval I, all requests that would have arrived
 * behind it during that stall are omitted from the sample pool.
 *
 * This function injects the missing virtual samples (L - I, L - 2I, ...) into
 * the histogram, accurately penalizing high percentiles (p95, p99) to reflect
 * what real users experienced while the system was stalled.
 */
export function recordWithCorrection(
  histogram: Histogram,
  latencyUs: number,
  expectedIntervalUs: number
): number {
  const primaryVal = Math.max(0, latencyUs);
  histogram.record(primaryVal);

  if (expectedIntervalUs <= 0 || primaryVal <= expectedIntervalUs) {
    return 1;
  }

  let totalSamplesAdded = 1;
  let virtualLatencyUs = primaryVal - expectedIntervalUs;

  // Synthesize missing requests queued behind the stall
  while (virtualLatencyUs > 0) {
    histogram.record(virtualLatencyUs);
    totalSamplesAdded++;
    virtualLatencyUs -= expectedIntervalUs;
  }

  return totalSamplesAdded;
}

/**
 * Helper to extract formatted LatencyDistribution metrics from a Histogram.
 */
export function extractDistribution(h: Histogram): LatencyDistribution {
  return {
    p50: h.percentileMs(50),
    p90: h.percentileMs(90),
    p95: h.percentileMs(95),
    p99: h.percentileMs(99),
    min: h.minMs(),
    max: h.maxMs(),
    mean: h.meanMs(),
  };
}

/**
 * Calculates the queue delay distribution by subtracting service time from response time.
 */
export function computeQueueDelay(
  response: LatencyDistribution,
  service: LatencyDistribution
): LatencyDistribution {
  return {
    p50: Math.max(0, response.p50 - service.p50),
    p90: Math.max(0, response.p90 - service.p90),
    p95: Math.max(0, response.p95 - service.p95),
    p99: Math.max(0, response.p99 - service.p99),
    min: Math.max(0, response.min - service.min),
    max: Math.max(0, response.max - service.max),
    mean: Math.max(0, response.mean - service.mean),
  };
}
