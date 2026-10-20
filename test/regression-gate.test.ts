import { describe, it, expect } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { saveBaseline, loadBaseline, compareRuns } from "../src/modes/regression-gate.js";
import {
  formatComparisonTerminalReport,
  generateGithubStepSummary,
} from "../src/report/compare-terminal.js";
import { formatComparisonJsonReport, formatComparisonCsvReport } from "../src/report/export.js";
import type { RunSummary, BaselineData } from "../src/types.js";

describe("Phase 5 Baseline Comparison & CI Regression Gate", () => {
  const mockCurrent: RunSummary = {
    target: "http://localhost:3000/api",
    rps: 1200.0,
    totalRequests: 12000,
    durationSec: 10.0,
    p50: 12.0,
    p90: 24.0,
    p95: 35.0,
    p99: 60.0,
    errorRate: 0.0,
    networkErrors: 0,
    httpErrors: 0,
    statusCodes: { 200: 12000 },
    errorsByType: {},
    series: [],
    selfCheckWarnings: [],
  };

  const mockBaseline: BaselineData = {
    timestamp: "2026-10-20T10:00:00.000Z",
    target: "http://localhost:3000/api",
    concurrency: 20,
    durationSec: 10.0,
    rps: 1250.0,
    totalRequests: 12500,
    p50: 13.0,
    p90: 25.0,
    p95: 36.0,
    p99: 65.0,
    errorRate: 0.0,
    networkErrors: 0,
    httpErrors: 0,
  };

  it("saves and loads baseline JSON file accurately", async () => {
    const tmpFile = path.join(os.tmpdir(), `test-baseline-${Date.now()}.json`);
    try {
      const savedPath = await saveBaseline(mockCurrent, tmpFile, { concurrency: 20 });
      expect(savedPath).toBe(tmpFile);

      const loaded = await loadBaseline(tmpFile);
      expect(loaded.target).toBe(mockCurrent.target);
      expect(loaded.rps).toBe(mockCurrent.rps);
      expect(loaded.p95).toBe(mockCurrent.p95);
      expect(loaded.concurrency).toBe(20);
      expect(loaded.timestamp).toBeDefined();
    } finally {
      await fs.unlink(tmpFile).catch(() => {});
    }
  });

  it("passes when current run is within regression tolerances", () => {
    // Current RPS: 1200 vs Baseline 1250 (-4% drop, within allowed 5%)
    // Current p95: 35ms vs Baseline 36ms (-2.8% improvement)
    const comparison = compareRuns(mockCurrent, mockBaseline, {
      maxP95IncreasePct: 10,
      maxRpsDropPct: 5,
    });

    expect(comparison.passed).toBe(true);
    expect(comparison.regressions).toHaveLength(0);
    expect(comparison.improvements.length).toBeGreaterThan(0);
  });

  it("detects p95 latency regression when increase exceeds threshold", () => {
    const regressedCurrent: RunSummary = {
      ...mockCurrent,
      p95: 50.0, // Baseline is 36ms -> +38.9% increase (limit: 10%)
    };

    const comparison = compareRuns(regressedCurrent, mockBaseline, {
      maxP95IncreasePct: 10,
    });

    expect(comparison.passed).toBe(false);
    expect(comparison.regressions.length).toBe(1);
    expect(comparison.regressions[0].name).toBe("p95 Latency");
    expect(comparison.regressions[0].deltaPct).toBeGreaterThan(30);
    expect(comparison.regressions[0].thresholdViolation).toBe(true);
    expect(comparison.regressions[0].status).toBe("REGRESSION");
  });

  it("detects throughput regression when RPS drop exceeds threshold", () => {
    const droppedCurrent: RunSummary = {
      ...mockCurrent,
      rps: 1000.0, // Baseline is 1250 -> -20% drop (limit: 5%)
    };

    const comparison = compareRuns(droppedCurrent, mockBaseline, {
      maxRpsDropPct: 5,
    });

    expect(comparison.passed).toBe(false);
    const rpsRegression = comparison.regressions.find((r) => r.name === "Throughput");
    expect(rpsRegression).toBeDefined();
    expect(rpsRegression!.deltaPct).toBe(-20);
    expect(rpsRegression!.status).toBe("REGRESSION");
  });

  it("detects error rate violation when error budget is exceeded", () => {
    const errorCurrent: RunSummary = {
      ...mockCurrent,
      errorRate: 0.02, // 2% errors, limit is 1%
    };

    const comparison = compareRuns(errorCurrent, mockBaseline, {
      maxErrorRate: 0.01,
    });

    expect(comparison.passed).toBe(false);
    const errRegression = comparison.regressions.find((r) => r.name === "Error Rate");
    expect(errRegression).toBeDefined();
    expect(errRegression!.status).toBe("REGRESSION");
  });

  it("formats terminal comparison report with badges and conclusion", () => {
    const comparison = compareRuns(mockCurrent, mockBaseline);
    const termReport = formatComparisonTerminalReport(comparison);

    expect(termReport).toContain("LoadScope CI Performance Regression Gate");
    expect(termReport).toContain("Throughput");
    expect(termReport).toContain("p95 Latency");
    expect(termReport).toContain("PERFORMANCE REGRESSION GATE PASSED");
  });

  it("generates markdown GitHub step summary table", () => {
    const comparison = compareRuns(mockCurrent, mockBaseline);
    const md = generateGithubStepSummary(comparison);

    expect(md).toContain("## ✅ LoadScope Performance Regression Gate: PASSED");
    expect(md).toContain("| Metric | Baseline | Current | Delta | Delta % | Status |");
    expect(md).toContain("**Throughput**");
    expect(md).toContain("**p95 Latency**");
  });

  it("serializes comparison to formatted JSON and CSV", () => {
    const comparison = compareRuns(mockCurrent, mockBaseline);

    const json = formatComparisonJsonReport(comparison);
    const parsed = JSON.parse(json);
    expect(parsed.passed).toBe(true);
    expect(parsed.metrics).toHaveLength(6);

    const csv = formatComparisonCsvReport(comparison);
    expect(csv).toContain("# LoadScope CI Regression Gate Comparison");
    expect(csv).toContain("# Metrics Comparison");
    expect(csv).toContain("\"Throughput\"");
  });
});
