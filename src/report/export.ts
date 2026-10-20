import type { RunSummary } from "../types.js";

export function formatJsonReport(summary: RunSummary): string {
  return JSON.stringify(summary, null, 2);
}

export function formatCsvReport(summary: RunSummary): string {
  const lines: string[] = [];

  lines.push("# LoadScope Run Summary");
  lines.push("target,duration_sec,total_requests,rps,p50_ms,p90_ms,p95_ms,p99_ms,error_rate,network_errors,http_errors");
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
    ].join(",")
  );

  lines.push("");

  lines.push("# Per-Second Latency Series");
  lines.push("time_sec,p95_ms");
  for (const point of summary.series) {
    lines.push(`${point.t},${point.p95.toFixed(2)}`);
  }

  lines.push("");

  lines.push("# Status Codes");
  lines.push("status_code,count");
  for (const [code, count] of Object.entries(summary.statusCodes)) {
    lines.push(`${code},${count}`);
  }

  return lines.join("\n");
}
