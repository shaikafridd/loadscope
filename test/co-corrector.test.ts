import { describe, it, expect } from "vitest";
import { Histogram } from "../src/stats/histogram.js";
import {
  recordWithCorrection,
  extractDistribution,
  computeQueueDelay,
} from "../src/stats/co-corrector.js";

describe("Phase 3 Gil Tene Coordinated Omission Corrector", () => {
  it("does not inject virtual samples when latency is under expected interval", () => {
    const h = new Histogram();
    const expectedIntervalUs = 10_000; // 10ms
    const latencyUs = 5_000; // 5ms

    const added = recordWithCorrection(h, latencyUs, expectedIntervalUs);
    expect(added).toBe(1);
    expect(h.total).toBe(1);
    expect(h.max()).toBe(5000);
  });

  it("injects missing virtual samples linearly when a stall occurs", () => {
    const h = new Histogram();
    const expectedIntervalUs = 1_000; // 1ms
    const stallLatencyUs = 5_000;     // 5ms stall

    // Expected samples injected: 5000, 4000, 3000, 2000, 1000 = 5 samples
    const added = recordWithCorrection(h, stallLatencyUs, expectedIntervalUs);
    expect(added).toBe(5);
    expect(h.total).toBe(5);
    expect(h.max()).toBe(5000);
    expect(h.min()).toBe(1000);
  });

  it("penalizes tail percentiles when coordinated omission correction is applied", () => {
    const uncorrected = new Histogram();
    const corrected = new Histogram();
    const expectedIntervalUs = 1_000; // 1ms (1000 RPS)

    // Simulate 990 fast requests (1ms) and 10 slow requests (100ms)
    for (let i = 0; i < 990; i++) {
      uncorrected.record(1000);
      corrected.record(1000);
    }

    for (let i = 0; i < 10; i++) {
      uncorrected.record(100_000);
      recordWithCorrection(corrected, 100_000, expectedIntervalUs);
    }

    // In uncorrected histogram, total = 1000. 10 slow requests = exactly 1% of samples.
    // In corrected histogram, each 100ms stall injects ~100 virtual samples, total > 1900.
    expect(uncorrected.total).toBe(1000);
    expect(corrected.total).toBeGreaterThan(1900);

    // The p90 in the corrected histogram reveals the severe user degradation
    expect(corrected.percentileMs(90)).toBeGreaterThan(uncorrected.percentileMs(90));
  });

  it("computes queue delay distribution correctly", () => {
    const responseDist = {
      p50: 25.0,
      p90: 50.0,
      p95: 100.0,
      p99: 250.0,
      min: 5.0,
      max: 300.0,
      mean: 40.0,
    };

    const serviceDist = {
      p50: 20.0,
      p90: 30.0,
      p95: 40.0,
      p99: 50.0,
      min: 5.0,
      max: 60.0,
      mean: 25.0,
    };

    const qDelay = computeQueueDelay(responseDist, serviceDist);
    expect(qDelay.p50).toBe(5.0);
    expect(qDelay.p90).toBe(20.0);
    expect(qDelay.p95).toBe(60.0);
    expect(qDelay.p99).toBe(200.0);
  });

  it("extracts clean LatencyDistribution from Histogram", () => {
    const h = new Histogram();
    h.record(1000);
    h.record(2000);
    h.record(3000);

    const dist = extractDistribution(h);
    expect(dist.min).toBe(1);
    expect(dist.max).toBe(3);
    expect(dist.mean).toBe(2);
    expect(dist.p50).toBeGreaterThan(0);
  });
});
