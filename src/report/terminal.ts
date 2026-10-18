import picocolors from "picocolors";
import type { RunSummary } from "../types.js";

/**
 * Format a number to fixed decimals or integer.
 */
function fmt(num: number, decimals = 2): string {
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Print a clean, formatted terminal summary report.
 */
export function printTerminalReport(s: RunSummary): void {
  const line = picocolors.dim("─".repeat(58));

  console.log("\n" + line);
  console.log(
    picocolors.bold(picocolors.cyan(" LoadScope Test Results ")) +
      picocolors.dim(`• ${s.target}`)
  );
  console.log(line);

  // Overview
  console.log(
    ` ${picocolors.dim("Duration:")}    ${picocolors.bold(fmt(s.durationSec, 1))}s` +
      `    ${picocolors.dim("Total Requests:")} ${picocolors.bold(s.totalRequests.toLocaleString())}`
  );
  console.log(
    ` ${picocolors.dim("Throughput:")}  ${picocolors.green(picocolors.bold(fmt(s.rps, 1)))} req/s` +
      `    ${picocolors.dim("Error Rate:")}     ${s.errorRate > 0 ? picocolors.red(fmt(s.errorRate * 100, 2) + "%") : picocolors.green("0.00%")}`
  );

  console.log("\n" + picocolors.bold(" Latency Distribution:"));
  console.log(picocolors.dim(" ┌────────────┬────────────────┐"));
  console.log(picocolors.dim(" │") + " Percentile " + picocolors.dim("│") + " Latency (ms)   " + picocolors.dim("│"));
  console.log(picocolors.dim(" ├────────────┼────────────────┤"));

  const rows: [string, number][] = [
    ["p50 (median)", s.p50],
    ["p90", s.p95 * 0.9], // Or custom
    ["p95", s.p95],
    ["p99", s.p99],
  ];

  for (const [pct, val] of [
    ["p50 (median)", s.p50],
    ["p95", s.p95],
    ["p99", s.p99],
  ]) {
    const valColor = typeof val === "number" && val > 300 ? picocolors.yellow : picocolors.cyan;
    const namePadded = pct.padEnd(10);
    const valStr = fmt(val, 2).padStart(12) + " ms ";
    console.log(
      picocolors.dim(" │ ") +
        picocolors.white(namePadded) +
        picocolors.dim("│ ") +
        valColor(valStr) +
        picocolors.dim("│")
    );
  }
  console.log(picocolors.dim(" └────────────┴────────────────┘"));

  // Status codes
  const statusEntries = Object.entries(s.statusCodes);
  if (statusEntries.length > 0) {
    console.log("\n" + picocolors.bold(" HTTP Status Codes:"));
    for (const [code, count] of statusEntries) {
      const numCode = Number(code);
      let colorFn = picocolors.green;
      if (numCode >= 400 && numCode < 500) colorFn = picocolors.yellow;
      if (numCode >= 500) colorFn = picocolors.red;

      console.log(`   ${colorFn(code)}: ${count.toLocaleString()} requests`);
    }
  }

  // Self check warnings (if any)
  if (s.selfCheckWarnings && s.selfCheckWarnings.length > 0) {
    console.log("\n" + picocolors.yellow(picocolors.bold(" Self-Monitoring Warnings:")));
    for (const warning of s.selfCheckWarnings) {
      console.log(`   ${picocolors.yellow("⚠️ ")} ${warning}`);
    }
  }

  console.log(line + "\n");
}
