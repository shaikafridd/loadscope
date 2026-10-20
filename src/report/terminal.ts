import picocolors from "picocolors";
import type { RunSummary } from "../types.js";

/**
 * Format a number to fixed decimals or integer.
 */
function fmt(num: number, decimals = 2): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Generate a clean, formatted terminal summary report string.
 * Kept pure without console.log side-effects for testability.
 */
export function formatTerminalReport(s: RunSummary): string {
  const lines: string[] = [];
  const divider = picocolors.dim("─".repeat(58));

  lines.push("");
  lines.push(divider);
  lines.push(
    picocolors.bold(picocolors.cyan(" LoadScope Test Results ")) +
      picocolors.dim(`• ${s.target}`)
  );
  lines.push(divider);

  // Overview
  lines.push(
    ` ${picocolors.dim("Duration:")}    ${picocolors.bold(fmt(s.durationSec, 1))}s` +
      `    ${picocolors.dim("Total Requests:")} ${picocolors.bold(s.totalRequests.toLocaleString())}`
  );

  const errorColor = s.errorRate > 0 ? picocolors.red : picocolors.green;
  const errorRateStr = errorColor(fmt(s.errorRate * 100, 2) + "%");
  lines.push(
    ` ${picocolors.dim("Throughput:")}  ${picocolors.green(picocolors.bold(fmt(s.rps, 1)))} req/s` +
      `    ${picocolors.dim("Error Rate:")}     ${errorRateStr}`
  );

  if (s.distribution || s.scheduleDriftMs !== undefined) {
    const distText = s.distribution ? `Open Arrival (${s.distribution.toUpperCase()})` : "Closed Concurrency";
    const driftText = s.scheduleDriftMs !== undefined ? ` • Schedule Drift: ${fmt(s.scheduleDriftMs, 2)}ms` : "";
    lines.push(` ${picocolors.dim("Model:")}       ${picocolors.white(distText)}${picocolors.dim(driftText)}`);
  }

  if (s.networkErrors > 0 || s.httpErrors > 0) {
    const errorDetails: string[] = [];
    if (s.httpErrors > 0) errorDetails.push(`${s.httpErrors.toLocaleString()} HTTP 4xx/5xx`);
    if (s.networkErrors > 0) errorDetails.push(`${s.networkErrors.toLocaleString()} network`);
    lines.push(` ${picocolors.dim("Failures:")}    ${picocolors.yellow(errorDetails.join(", "))}`);
  }

  // Phase 3: Coordinated Omission Multi-Column Breakdown
  if (s.serviceTime && s.queueDelay) {
    lines.push("");
    lines.push(picocolors.bold(" Coordinated Omission Breakdown (Honest Latency vs Service Time):"));
    lines.push(picocolors.dim(" ┌────────────────┬────────────────┬────────────────┬────────────────┐"));
    lines.push(
      picocolors.dim(" │ ") +
        picocolors.white("Percentile".padEnd(14)) +
        picocolors.dim(" │ ") +
        picocolors.white("Service Time".padEnd(14)) +
        picocolors.dim(" │ ") +
        picocolors.white("Queue Delay".padEnd(14)) +
        picocolors.dim(" │ ") +
        picocolors.white("Honest Total".padEnd(14)) +
        picocolors.dim(" │")
    );
    lines.push(picocolors.dim(" ├────────────────┼────────────────┼────────────────┼────────────────┤"));

    const compRows: Array<[string, number, number, number]> = [
      ["p50 (median)", s.serviceTime.p50, s.queueDelay.p50, s.p50],
      ["p90", s.serviceTime.p90, s.queueDelay.p90, s.p90],
      ["p95", s.serviceTime.p95, s.queueDelay.p95, s.p95],
      ["p99", s.serviceTime.p99, s.queueDelay.p99, s.p99],
    ];

    for (const [pct, svc, q, total] of compRows) {
      const totalColor = total > 300 ? picocolors.yellow : picocolors.cyan;
      const qColor = q > 50 ? picocolors.yellow : picocolors.dim;

      lines.push(
        picocolors.dim(" │ ") +
          picocolors.white(pct.padEnd(14)) +
          picocolors.dim(" │ ") +
          picocolors.cyan((fmt(svc, 2) + " ms").padStart(14)) +
          picocolors.dim(" │ ") +
          qColor((fmt(q, 2) + " ms").padStart(14)) +
          picocolors.dim(" │ ") +
          totalColor((fmt(total, 2) + " ms").padStart(14)) +
          picocolors.dim(" │")
      );
    }
    lines.push(picocolors.dim(" └────────────────┴────────────────┴────────────────┴────────────────┘"));
  } else {
    // Standard Latency Distribution Table
    lines.push("");
    lines.push(picocolors.bold(" Latency Distribution:"));
    lines.push(picocolors.dim(" ┌────────────────┬────────────────┐"));
    lines.push(
      picocolors.dim(" │ ") +
        picocolors.white("Percentile".padEnd(14)) +
        picocolors.dim(" │ ") +
        picocolors.white("Latency (ms)".padEnd(14)) +
        picocolors.dim(" │")
    );
    lines.push(picocolors.dim(" ├────────────────┼────────────────┤"));

    const rows: Array<[string, number]> = [
      ["p50 (median)", s.p50],
      ["p90", s.p90],
      ["p95", s.p95],
      ["p99", s.p99],
    ];

    for (const [pct, val] of rows) {
      const valColor = val > 300 ? picocolors.yellow : picocolors.cyan;
      const namePadded = pct.padEnd(14);
      const valFormatted = (fmt(val, 2) + " ms").padStart(14);
      lines.push(
        picocolors.dim(" │ ") +
          picocolors.white(namePadded) +
          picocolors.dim(" │ ") +
          valColor(valFormatted) +
          picocolors.dim(" │")
      );
    }
    lines.push(picocolors.dim(" └────────────────┴────────────────┘"));
  }

  // Time-To-First-Byte (TTFB) Breakdown
  if (s.ttfb) {
    lines.push("");
    lines.push(
      picocolors.bold(" Time-To-First-Byte (TTFB): ") +
        `p50: ${picocolors.cyan(fmt(s.ttfb.p50, 2) + "ms")}  ` +
        `p90: ${picocolors.cyan(fmt(s.ttfb.p90, 2) + "ms")}  ` +
        `p95: ${picocolors.cyan(fmt(s.ttfb.p95, 2) + "ms")}  ` +
        `p99: ${picocolors.cyan(fmt(s.ttfb.p99, 2) + "ms")}`
    );
  }

  // Status codes
  const statusEntries = Object.entries(s.statusCodes);
  if (statusEntries.length > 0) {
    lines.push("");
    lines.push(picocolors.bold(" HTTP Status Codes:"));
    for (const [code, count] of statusEntries) {
      const numCode = Number(code);
      let colorFn = picocolors.green;
      if (numCode >= 400 && numCode < 500) colorFn = picocolors.yellow;
      if (numCode >= 500) colorFn = picocolors.red;

      lines.push(`   ${colorFn(code)}: ${count.toLocaleString()} requests`);
    }
  }

  // Network error details (if any)
  if (s.errorsByType && Object.keys(s.errorsByType).length > 0) {
    lines.push("");
    lines.push(picocolors.bold(" Network Error Breakdown:"));
    for (const [errType, count] of Object.entries(s.errorsByType)) {
      lines.push(`   ${picocolors.red(errType)}: ${count.toLocaleString()} occurrences`);
    }
  }

  // Self check warnings (if any)
  if (s.selfCheckWarnings && s.selfCheckWarnings.length > 0) {
    lines.push("");
    lines.push(picocolors.yellow(picocolors.bold(" Self-Monitoring Warnings:")));
    for (const warning of s.selfCheckWarnings) {
      lines.push(`   ${picocolors.yellow("⚠️ ")} ${warning}`);
    }
  }

  lines.push(divider);
  lines.push("");

  return lines.join("\n");
}

/**
 * Print a clean, formatted terminal summary report to stdout.
 */
export function printTerminalReport(s: RunSummary): void {
  console.log(formatTerminalReport(s));
}
