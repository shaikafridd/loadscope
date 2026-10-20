import picocolors from "picocolors";
import fs from "node:fs/promises";
import type { ComparisonSummary, ComparisonMetric } from "../types.js";

function fmt(num: number, decimals = 1): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pad(str: string, width: number, alignRight = false): string {
  if (str.length >= width) return str;
  const padding = " ".repeat(width - str.length);
  return alignRight ? padding + str : str + padding;
}

function formatDeltaPct(metric: ComparisonMetric): string {
  const sign = metric.deltaPct > 0 ? "+" : "";
  const pctStr = `${sign}${fmt(metric.deltaPct, 1)}%`;

  if (metric.status === "REGRESSION") {
    return picocolors.red(picocolors.bold(pctStr));
  }
  if (metric.status === "IMPROVEMENT") {
    return picocolors.green(picocolors.bold(pctStr));
  }
  return picocolors.dim(pctStr);
}

function formatStatusBadge(status: "PASS" | "IMPROVEMENT" | "REGRESSION"): string {
  switch (status) {
    case "IMPROVEMENT":
      return picocolors.green("⚡ IMPROVED");
    case "REGRESSION":
      return picocolors.red("❌ REGRESSED");
    default:
      return picocolors.green("✅ PASS");
  }
}

/**
 * Generates an aligned terminal comparison table string.
 */
export function formatComparisonTerminalReport(summary: ComparisonSummary): string {
  const lines: string[] = [];
  const divider = picocolors.dim("─".repeat(84));

  lines.push("");
  lines.push(divider);
  lines.push(
    picocolors.bold(picocolors.cyan(" LoadScope CI Performance Regression Gate ")) +
      picocolors.dim(`• ${summary.currentTarget}`)
  );
  lines.push(divider);

  if (summary.baselineTimestamp) {
    lines.push(
      ` ${picocolors.dim("Baseline Date:")}  ${summary.baselineTimestamp}` +
        `    ${picocolors.dim("Gate Status:")}   ${summary.passed ? picocolors.green("PASSED") : picocolors.red("FAILED")}`
    );
  }

  const limitsDesc: string[] = [
    `p95 limit: +${summary.thresholds.maxP95IncreasePct}%`,
    `RPS drop limit: -${summary.thresholds.maxRpsDropPct}%`,
  ];
  if (summary.thresholds.maxP99IncreasePct !== undefined) {
    limitsDesc.push(`p99 limit: +${summary.thresholds.maxP99IncreasePct}%`);
  }
  if (summary.thresholds.maxErrorRate !== undefined) {
    limitsDesc.push(`max error: ${(summary.thresholds.maxErrorRate * 100).toFixed(1)}%`);
  }
  lines.push(` ${picocolors.dim("Tolerances:")}     ${picocolors.yellow(limitsDesc.join(" | "))}`);
  lines.push("");

  // Table Header
  lines.push(picocolors.dim(" ┌──────────────┬──────────────┬──────────────┬──────────────┬────────────┬─────────────┐"));
  lines.push(
    picocolors.bold(
      ` │ ${pad("Metric", 12)} │ ${pad("Baseline", 12)} │ ${pad("Current", 12)} │ ${pad("Delta", 12)} │ ${pad("Delta %", 10)} │ ${pad("Status", 11)} │`
    )
  );
  lines.push(picocolors.dim(" ├──────────────┼──────────────┼──────────────┼──────────────┼────────────┼─────────────┤"));

  // Rows
  for (const m of summary.metrics) {
    const isError = m.name === "Error Rate";
    const decimals = isError ? 2 : 1;
    const baseStr = `${fmt(m.baseline, decimals)}${m.unit}`;
    const currStr = `${fmt(m.current, decimals)}${m.unit}`;
    const deltaSign = m.delta > 0 ? "+" : "";
    const deltaStr = `${deltaSign}${fmt(m.delta, decimals)}${m.unit}`;
    const deltaPctStr = formatDeltaPct(m);
    const badge = formatStatusBadge(m.status);

    lines.push(
      ` │ ${pad(m.name, 12)} │ ` +
      `${pad(baseStr, 12, true)} │ ` +
      `${pad(currStr, 12, true)} │ ` +
      `${pad(deltaStr, 12, true)} │ ` +
      `${pad(deltaPctStr, 10, true)} │ ` +
      `${pad(badge, 11)} │`
    );
  }

  lines.push(picocolors.dim(" └──────────────┴──────────────┴──────────────┴──────────────┴────────────┴─────────────┘"));
  lines.push("");

  // Conclusion banner
  if (summary.passed) {
    lines.push(
      picocolors.green(
        picocolors.bold(" 🛡️  PERFORMANCE REGRESSION GATE PASSED: All metrics within SLA tolerances!")
      )
    );
    if (summary.improvements.length > 0) {
      lines.push(
        picocolors.dim(
          `    Observed ${summary.improvements.length} performance improvement(s) compared to baseline.`
        )
      );
    }
  } else {
    lines.push(
      picocolors.red(
        picocolors.bold(` ❌ PERFORMANCE REGRESSION DETECTED: ${summary.regressions.length} metric(s) breached limits!`)
      )
    );
    for (const r of summary.regressions) {
      lines.push(picocolors.red(`    • ${r.name}: ${r.message || "Exceeded tolerance threshold"}`));
    }
  }

  lines.push(divider);
  lines.push("");
  return lines.join("\n");
}

/**
 * Print the comparison report to stdout.
 */
export function printComparisonTerminalReport(summary: ComparisonSummary): void {
  console.log(formatComparisonTerminalReport(summary));
}

/**
 * Generates GitHub Actions-flavored markdown step summary.
 */
export function generateGithubStepSummary(summary: ComparisonSummary): string {
  const lines: string[] = [];
  const statusEmoji = summary.passed ? "✅" : "❌";
  const statusText = summary.passed ? "PASSED" : "FAILED";

  lines.push(`## ${statusEmoji} LoadScope Performance Regression Gate: ${statusText}`);
  lines.push("");
  lines.push(`**Target:** \`${summary.currentTarget}\`  `);
  if (summary.baselineTimestamp) {
    lines.push(`**Baseline Timestamp:** \`${summary.baselineTimestamp}\`  `);
  }
  lines.push(`**Gate Result:** **${statusText}** (${summary.regressions.length} regressions, ${summary.improvements.length} improvements)`);
  lines.push("");

  lines.push("| Metric | Baseline | Current | Delta | Delta % | Status |");
  lines.push("| :--- | :---: | :---: | :---: | :---: | :---: |");

  for (const m of summary.metrics) {
    const isError = m.name === "Error Rate";
    const decimals = isError ? 2 : 1;
    const baseStr = `${fmt(m.baseline, decimals)}${m.unit}`;
    const currStr = `${fmt(m.current, decimals)}${m.unit}`;
    const deltaSign = m.delta > 0 ? "+" : "";
    const deltaStr = `${deltaSign}${fmt(m.delta, decimals)}${m.unit}`;
    const deltaPctStr = `${deltaSign}${fmt(m.deltaPct, 1)}%`;

    let badge = "PASS";
    if (m.status === "REGRESSION") badge = "**REGRESSION** ❌";
    else if (m.status === "IMPROVEMENT") badge = "IMPROVEMENT ⚡";
    else badge = "PASS ✅";

    lines.push(`| **${m.name}** | ${baseStr} | ${currStr} | ${deltaStr} | ${deltaPctStr} | ${badge} |`);
  }

  lines.push("");
  if (!summary.passed) {
    lines.push("### ⚠️ Regression Details");
    for (const r of summary.regressions) {
      lines.push(`- **${r.name}:** ${r.message}`);
    }
  }

  return lines.join("\n");
}

/**
 * Appends markdown summary to $GITHUB_STEP_SUMMARY if available in GitHub Actions.
 */
export async function writeGithubStepSummary(summary: ComparisonSummary): Promise<void> {
  const stepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!stepSummaryPath) return;

  try {
    const markdown = generateGithubStepSummary(summary) + "\n\n";
    await fs.appendFile(stepSummaryPath, markdown, "utf-8");
  } catch {
    // Ignore error if GITHUB_STEP_SUMMARY is not writable
  }
}
