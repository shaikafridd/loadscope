import { describe, it, expect } from "vitest";
import { Histogram } from "../src/stats/histogram.js";
import * as hdr from "hdr-histogram-js";

describe("Fixed-Memory Log-Bucketed Histogram", () => {
  it("initializes with zero total and empty buckets", () => {
    const h = new Histogram();
    expect(h.total).toBe(0);
    expect(h.min()).toBe(0);
    expect(h.max()).toBe(0);
    expect(h.mean()).toBe(0);
    expect(h.percentile(50)).toBe(0);
  });

  it("records values accurately and computes min/max/mean", () => {
    const h = new Histogram();
    h.record(1000); // 1 ms
    h.record(2000); // 2 ms
    h.record(3000); // 3 ms

    expect(h.total).toBe(3);
    expect(h.min()).toBe(1000);
    expect(h.max()).toBe(3000);
    expect(h.mean()).toBe(2000);
    expect(h.meanMs()).toBe(2);
    expect(h.minMs()).toBe(1);
    expect(h.maxMs()).toBe(3);
  });

  it("strictly clamps percentile() to never exceed max() or drop below min()", () => {
    const h = new Histogram();
    // Test with single sample where bucket upper edge would normally overshoot
    h.record(1523);
    expect(h.percentile(100)).toBe(1523);
    expect(h.percentile(99.9)).toBeLessThanOrEqual(h.max());
    expect(h.percentile(50)).toBeLessThanOrEqual(h.max());
    expect(h.percentile(50)).toBeGreaterThanOrEqual(h.min());

    // Test with cluster of samples
    h.record(1524);
    h.record(1525);
    for (let p = 0; p <= 100; p += 5) {
      expect(h.percentile(p)).toBeLessThanOrEqual(h.max());
      expect(h.percentile(p)).toBeGreaterThanOrEqual(h.min());
    }
  });

  it("matches hdr-histogram-js percentiles within ~2% error bound on bimodal distribution", () => {
    const custom = new Histogram();
    const reference = hdr.build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 3600000000,
      numberOfSignificantValueDigits: 3,
    });

    for (let i = 0; i < 10000; i++) {
      let sampleUs: number;
      if (i % 10 === 0) {
        sampleUs = Math.floor(100000 + Math.random() * 400000);
      } else {
        sampleUs = Math.floor(5000 + Math.random() * 25000);
      }
      custom.record(sampleUs);
      reference.recordValue(sampleUs);
    }

    const testPercentiles = [50, 75, 90, 95, 99];
    for (const p of testPercentiles) {
      const customVal = custom.percentile(p);
      const refVal = reference.getValueAtPercentile(p);
      const relativeError = Math.abs(customVal - refVal) / refVal;

      expect(relativeError).toBeLessThan(0.03);
    }
  });

  it("matches hdr-histogram-js on heavy-tailed Pareto distribution across p50, p90, p95, p99", () => {
    const custom = new Histogram();
    const reference = hdr.build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 3600000000,
      numberOfSignificantValueDigits: 3,
    });

    // Pareto distribution: x = x_m / (U^(1/alpha))
    const alpha = 1.5;
    const xm = 1000; // 1ms base
    for (let i = 0; i < 5000; i++) {
      const u = Math.max(0.0001, Math.random());
      const valUs = Math.min(10_000_000, Math.floor(xm / Math.pow(u, 1 / alpha)));
      custom.record(valUs);
      reference.recordValue(valUs);
    }

    for (const p of [50, 90, 95, 99]) {
      const customVal = custom.percentile(p);
      const refVal = reference.getValueAtPercentile(p);
      const relativeError = Math.abs(customVal - refVal) / refVal;
      expect(relativeError).toBeLessThan(0.03);
    }
  });

  it("merges two histograms correctly", () => {
    const h1 = new Histogram();
    const h2 = new Histogram();
    const combined = new Histogram();

    for (let i = 1; i <= 500; i++) {
      h1.record(i * 100);
      combined.record(i * 100);
    }

    for (let i = 501; i <= 1000; i++) {
      h2.record(i * 100);
      combined.record(i * 100);
    }

    h1.merge(h2);

    expect(h1.total).toBe(1000);
    expect(h1.total).toBe(combined.total);
    expect(h1.min()).toBe(combined.min());
    expect(h1.max()).toBe(combined.max());

    expect(h1.percentile(50)).toBeCloseTo(combined.percentile(50), 0);
    expect(h1.percentile(95)).toBeCloseTo(combined.percentile(95), 0);
  });

  it("handles edge cases: 0us, extreme values, reset", () => {
    const h = new Histogram();
    h.record(0);
    h.record(1);
    h.record(100000000); // 100 seconds

    expect(h.total).toBe(3);
    expect(h.min()).toBe(0);
    expect(h.max()).toBe(100000000);

    h.reset();
    expect(h.total).toBe(0);
    expect(h.min()).toBe(0);
    expect(h.max()).toBe(0);
    expect(h.percentile(50)).toBe(0);
  });
});
