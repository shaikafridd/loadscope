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
  });

  it("matches hdr-histogram-js percentiles within ~2% error bound", () => {
    const custom = new Histogram();
    const reference = hdr.build({
      lowestDiscernibleValue: 1,
      highestTrackableValue: 3600000000, // 1 hour in ms/us
      numberOfSignificantValueDigits: 3,
    });

    // Populate with 10,000 synthetic latency samples (in microseconds)
    // representing a realistic bimodal web service distribution:
    // mostly 10-30ms, with a tail up to 500ms
    for (let i = 0; i < 10000; i++) {
      let sampleUs: number;
      if (i % 10 === 0) {
        // 10% slow requests: 100ms - 500ms
        sampleUs = Math.floor(100000 + Math.random() * 400000);
      } else {
        // 90% fast requests: 5ms - 30ms
        sampleUs = Math.floor(5000 + Math.random() * 25000);
      }
      custom.record(sampleUs);
      reference.recordValue(sampleUs);
    }

    const testPercentiles = [50, 75, 90, 95, 99];
    for (const p of testPercentiles) {
      const customVal = custom.percentile(p);
      const refVal = reference.getValueAtPercentile(p);

      // Relative error: |custom - ref| / ref
      const relativeError = Math.abs(customVal - refVal) / refVal;

      // Custom histogram with GROWTH = 1.02 bounds error to ~2%
      expect(relativeError).toBeLessThan(0.03); // Within 3% tolerance
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

    // p50 and p95 should match closely
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
