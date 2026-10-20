import fs from "node:fs/promises";
import path from "node:path";
import type {
  RunSummary,
  BaselineData,
  ComparisonMetric,
  ComparisonSummary,
  GateThresholds,
} from "../types.js";

/**
 * Saves a RunSummary as a standard JSON baseline file.
 */
export async function saveBaseline(
  summary: RunSummary,
  filePath = "loadscope-baseline.json",
  options?: { concurrency?: number; rate?: number }
): Promise<string> {
  const resolvedPath = path.resolve(process.cwd(), filePath);

  const baseline: BaselineData = {
    timestamp: new Date().toISOString(),
    target: summary.target,
    concurrency: options?.concurrency,
    rate: options?.rate,
    durationSec: summary.durationSec,
    rps: summary.rps,
    totalRequests: summary.totalRequests,
    p50: summary.p50,
    p90: summary.p90,
    p95: summary.p95,
    p99: summary.p99,
    errorRate: summary.errorRate,
    networkErrors: summary.networkErrors,
    httpErrors: summary.httpErrors,
    commitHash: process.env.GITHUB_SHA || process.env.GIT_COMMIT || undefined,
  };

  await fs.writeFile(resolvedPath, JSON.stringify(baseline, null, 2), "utf-8");
  return resolvedPath;
}

/**
 * Loads a baseline JSON file from disk.
 */
export async function loadBaseline(filePath: string): Promise<BaselineData> {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const content = await fs.readFile(resolvedPath, "utf-8");
  const parsed = JSON.parse(content) as BaselineData;

  if (typeof parsed.rps !== "number" || typeof parsed.p95 !== "number") {
    throw new Error(`Invalid baseline file at ${filePath}: missing required performance metrics.`);
  }

  return parsed;
}

/**
 * Compares current benchmark results against a reference baseline and evaluates regression thresholds.
 */
export function compareRuns(
  current: RunSummary | BaselineData,
  baseline: BaselineData,
  thresholdsInput?: Partial<GateThresholds>
): ComparisonSummary {
  const thresholds: GateThresholds = {
    maxP95IncreasePct: thresholdsInput?.maxP95IncreasePct ?? 10,
    maxRpsDropPct: thresholdsInput?.maxRpsDropPct ?? 5,
    maxP99IncreasePct: thresholdsInput?.maxP99IncreasePct,
    maxErrorRate: thresholdsInput?.maxErrorRate ?? 0.01,
  };

  const metrics: ComparisonMetric[] = [];

  // 1. Throughput (RPS) - Higher is better
  {
    const delta = current.rps - baseline.rps;
    const deltaPct = baseline.rps > 0 ? (delta / baseline.rps) * 100 : 0;
    const isRegression = deltaPct < -thresholds.maxRpsDropPct;
    const isImprovement = deltaPct > 1.0;

    let status: "PASS" | "IMPROVEMENT" | "REGRESSION" = "PASS";
    if (isRegression) status = "REGRESSION";
    else if (isImprovement) status = "IMPROVEMENT";

    metrics.push({
      name: "Throughput",
      baseline: baseline.rps,
      current: current.rps,
      delta,
      deltaPct,
      unit: "req/s",
      isHigherBetter: true,
      status,
      threshold: thresholds.maxRpsDropPct,
      thresholdViolation: isRegression,
      message: isRegression
        ? `Throughput dropped by ${Math.abs(deltaPct).toFixed(1)}% (allowed drop: ${thresholds.maxRpsDropPct}%)`
        : undefined,
    });
  }

  // 2. p50 Latency (Median) - Lower is better
  {
    const delta = current.p50 - baseline.p50;
    const deltaPct = baseline.p50 > 0 ? (delta / baseline.p50) * 100 : 0;
    const isImprovement = deltaPct < -1.0;

    metrics.push({
      name: "p50 Latency",
      baseline: baseline.p50,
      current: current.p50,
      delta,
      deltaPct,
      unit: "ms",
      isHigherBetter: false,
      status: isImprovement ? "IMPROVEMENT" : "PASS",
    });
  }

  // 3. p90 Latency - Lower is better
  {
    const delta = current.p90 - baseline.p90;
    const deltaPct = baseline.p90 > 0 ? (delta / baseline.p90) * 100 : 0;
    const isImprovement = deltaPct < -1.0;

    metrics.push({
      name: "p90 Latency",
      baseline: baseline.p90,
      current: current.p90,
      delta,
      deltaPct,
      unit: "ms",
      isHigherBetter: false,
      status: isImprovement ? "IMPROVEMENT" : "PASS",
    });
  }

  // 4. p95 Latency - Lower is better (Primary SLA Gate)
  {
    const delta = current.p95 - baseline.p95;
    const deltaPct = baseline.p95 > 0 ? (delta / baseline.p95) * 100 : 0;
    const isRegression = deltaPct > thresholds.maxP95IncreasePct;
    const isImprovement = deltaPct < -1.0;

    let status: "PASS" | "IMPROVEMENT" | "REGRESSION" = "PASS";
    if (isRegression) status = "REGRESSION";
    else if (isImprovement) status = "IMPROVEMENT";

    metrics.push({
      name: "p95 Latency",
      baseline: baseline.p95,
      current: current.p95,
      delta,
      deltaPct,
      unit: "ms",
      isHigherBetter: false,
      status,
      threshold: thresholds.maxP95IncreasePct,
      thresholdViolation: isRegression,
      message: isRegression
        ? `p95 latency increased by +${deltaPct.toFixed(1)}% (allowed increase: ${thresholds.maxP95IncreasePct}%)`
        : undefined,
    });
  }

  // 5. p99 Latency - Lower is better
  {
    const delta = current.p99 - baseline.p99;
    const deltaPct = baseline.p99 > 0 ? (delta / baseline.p99) * 100 : 0;
    const isRegression =
      thresholds.maxP99IncreasePct !== undefined && deltaPct > thresholds.maxP99IncreasePct;
    const isImprovement = deltaPct < -1.0;

    let status: "PASS" | "IMPROVEMENT" | "REGRESSION" = "PASS";
    if (isRegression) status = "REGRESSION";
    else if (isImprovement) status = "IMPROVEMENT";

    metrics.push({
      name: "p99 Latency",
      baseline: baseline.p99,
      current: current.p99,
      delta,
      deltaPct,
      unit: "ms",
      isHigherBetter: false,
      status,
      threshold: thresholds.maxP99IncreasePct,
      thresholdViolation: isRegression,
      message: isRegression
        ? `p99 latency increased by +${deltaPct.toFixed(1)}% (allowed: ${thresholds.maxP99IncreasePct}%)`
        : undefined,
    });
  }

  // 6. Error Rate (%) - Lower is better
  {
    const delta = current.errorRate - baseline.errorRate;
    const deltaPct =
      baseline.errorRate > 0
        ? (delta / baseline.errorRate) * 100
        : current.errorRate > 0
        ? 100
        : 0;

    const isRegression =
      thresholds.maxErrorRate !== undefined && current.errorRate > thresholds.maxErrorRate;
    const isImprovement = current.errorRate < baseline.errorRate;

    let status: "PASS" | "IMPROVEMENT" | "REGRESSION" = "PASS";
    if (isRegression) status = "REGRESSION";
    else if (isImprovement) status = "IMPROVEMENT";

    metrics.push({
      name: "Error Rate",
      baseline: baseline.errorRate * 100,
      current: current.errorRate * 100,
      delta: delta * 100,
      deltaPct,
      unit: "%",
      isHigherBetter: false,
      status,
      threshold: thresholds.maxErrorRate !== undefined ? thresholds.maxErrorRate * 100 : undefined,
      thresholdViolation: isRegression,
      message: isRegression
        ? `Error rate ${(current.errorRate * 100).toFixed(2)}% exceeded limit ${(thresholds.maxErrorRate! * 100).toFixed(2)}%`
        : undefined,
    });
  }

  const regressions = metrics.filter((m) => m.status === "REGRESSION");
  const improvements = metrics.filter((m) => m.status === "IMPROVEMENT");
  const passed = regressions.length === 0;

  return {
    passed,
    baselineTarget: baseline.target,
    currentTarget: current.target,
    baselineTimestamp: baseline.timestamp,
    metrics,
    regressions,
    improvements,
    thresholds,
  };
}
