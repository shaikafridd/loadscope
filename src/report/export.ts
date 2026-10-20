import type { RunSummary } from "../types.js";

/**
 * Serializes a RunSummary to formatted JSON string.
 */
export function formatJsonReport(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Formats a RunSummary and its per-second time series into CSV format.
 */
export function formatCsvReport(summary: RunSummary): string {
  const lines: string[] = [];

  // Summary section
  lines.push("# LoadScope Run Summary");
  lines.push("target,duration_sec,total_requests,rps,p50_ms,p90_ms,p95_ms,p99_ms,error_rate,network_errors,http_errors,service_p95_ms,ttfb_p95_ms,distribution");
  lines.push(
    [
      `"${summary.target}"`,
      summary.durationSec.toFixed(2),
      summary.totalRequests,
      summary.rps.toFixed(2),
      summary.p50.toFixed(2),
      summary.p90.toFixed(2),
      summary.p95.toFixed(2),
      summary.p99.toFixed(2),
      (summary.errorRate * 100).toFixed(2) + "%",
      summary.networkErrors,
      summary.httpErrors,
      summary.serviceTime ? summary.serviceTime.p95.toFixed(2) : "N/A",
      summary.ttfb ? summary.ttfb.p95.toFixed(2) : "N/A",
      summary.distribution ?? "closed",
    ].join(",")
  );

  lines.push("");

  // Time-series section
  lines.push("# Per-Second Latency Series");
  lines.push("time_sec,p95_ms");
  for (const point of summary.series) {
    lines.push(`${point.t},${point.p95.toFixed(2)}`);
  }

  lines.push("");

  // Status codes section
  lines.push("# Status Codes");
  lines.push("status_code,count");
  for (const [code, count] of Object.entries(summary.statusCodes)) {
    lines.push(`${code},${count}`);
  }

  return lines.join("\n");
}

/**
 * Serializes a BreakpointSummary to formatted JSON string.
 */
export function formatBreakpointJsonReport(summary: import("../types.js").BreakpointSummary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Formats a BreakpointSummary and all its steps into CSV format.
 */
export function formatBreakpointCsvReport(summary: import("../types.js").BreakpointSummary): string {
  const lines: string[] = [];

  // Metadata
  lines.push("# LoadScope Breaking-Point Summary");
  lines.push("target,mode,start,max,step,step_duration_sec,breaking_point,safe_capacity,breached,breach_reason");
  lines.push(
    [
      `"${summary.target}"`,
      summary.mode,
      summary.start,
      summary.max,
      summary.step,
      summary.stepDurationSec,
      summary.breakingPoint !== undefined ? summary.breakingPoint : "none",
      summary.safeCapacity !== undefined ? summary.safeCapacity : "none",
      summary.breached,
      summary.breachReason ? `"${summary.breachReason}"` : "none",
    ].join(",")
  );

  lines.push("");

  // Steps
  lines.push("# Step Progression");
  lines.push("step,is_refinement,load,rps,p50_ms,p95_ms,p99_ms,error_rate,total_requests,network_errors,http_errors,status,breach_reason");
  const allSteps = [...summary.steps, ...summary.refinementSteps];
  for (const s of allSteps) {
    lines.push(
      [
        s.stepIndex,
        s.isRefinement ? "true" : "false",
        s.load,
        s.rps.toFixed(2),
        s.p50.toFixed(2),
        s.p95.toFixed(2),
        s.p99.toFixed(2),
        (s.errorRate * 100).toFixed(2) + "%",
        s.totalRequests,
        s.networkErrors,
        s.httpErrors,
        s.status,
        s.breachReason ? `"${s.breachReason}"` : "",
      ].join(",")
    );
  }

  return lines.join("\n");
}

/**
 * Serializes a ComparisonSummary to formatted JSON string.
 */
export function formatComparisonJsonReport(summary: import("../types.js").ComparisonSummary): string {
  return JSON.stringify(summary, null, 2);
}

/**
 * Formats a ComparisonSummary into CSV format.
 */
export function formatComparisonCsvReport(summary: import("../types.js").ComparisonSummary): string {
  const lines: string[] = [];

  lines.push("# LoadScope CI Regression Gate Comparison");
  lines.push("target,passed,regressions_count,improvements_count");
  lines.push(
    [
      `"${summary.currentTarget}"`,
      summary.passed,
      summary.regressions.length,
      summary.improvements.length,
    ].join(",")
  );

  lines.push("");

  lines.push("# Metrics Comparison");
  lines.push("metric,baseline,current,delta,delta_pct,unit,status,violation,message");
  for (const m of summary.metrics) {
    lines.push(
      [
        `"${m.name}"`,
        m.baseline.toFixed(2),
        m.current.toFixed(2),
        m.delta.toFixed(2),
        m.deltaPct.toFixed(2) + "%",
        `"${m.unit}"`,
        m.status,
        m.thresholdViolation ? "true" : "false",
        m.message ? `"${m.message}"` : "",
      ].join(",")
    );
  }

  return lines.join("\n");
}
