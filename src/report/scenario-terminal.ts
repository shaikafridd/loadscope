import picocolors from "picocolors";
import type { ScenarioSummary, StepSummary } from "../types.js";

function fmt(n: number, d = 1): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function pad(str: string, len: number, alignRight = false): string {
  if (str.length >= len) return str.substring(0, len);
  const diff = len - str.length;
  return alignRight ? " ".repeat(diff) + str : str + " ".repeat(diff);
}

/**
 * Formats a comprehensive terminal report for multi-step scenario execution.
 */
export function formatScenarioTerminalReport(summary: ScenarioSummary): string {
  const lines: string[] = [];
  const W = 80;

  lines.push("");
  lines.push(picocolors.bold(picocolors.cyan("╔" + "═".repeat(W) + "╗")));
  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    picocolors.bold(picocolors.white(pad(`  🎭 LoadScope Scenario Benchmark Results: ${summary.name}`, W))) +
    picocolors.bold(picocolors.cyan("║"))
  );
  lines.push(picocolors.bold(picocolors.cyan("╠" + "═".repeat(W) + "╣")));

  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    pad(`  Target:      ${summary.target}`, W) +
    picocolors.bold(picocolors.cyan("║"))
  );
  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    pad(`  Duration:    ${summary.durationSec.toFixed(1)}s  │  Concurrency: ${summary.concurrency} virtual users`, W) +
    picocolors.bold(picocolors.cyan("║"))
  );

  const completionPct = summary.totalJourneys > 0 ? (summary.completedJourneys / summary.totalJourneys) * 100 : 0;
  const compColor = completionPct >= 99 ? picocolors.green : completionPct >= 95 ? picocolors.yellow : picocolors.red;

  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    pad(
      `  Journeys:    ${summary.completedJourneys.toLocaleString("en-US")} completed / ${summary.totalJourneys.toLocaleString("en-US")} started (${compColor(fmt(completionPct, 1) + "%")})`,
      W
    ) +
    picocolors.bold(picocolors.cyan("║"))
  );

  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    pad(
      `  Journey RPS: ${fmt(summary.journeysPerSec, 1)} journeys/sec  │  Failed: ${summary.failedJourneys}`,
      W
    ) +
    picocolors.bold(picocolors.cyan("║"))
  );

  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    pad(
      `  E2E Latency: p50=${fmt(summary.journeyP50, 1)}ms  p90=${fmt(summary.journeyP90, 1)}ms  p95=${fmt(summary.journeyP95, 1)}ms  p99=${fmt(summary.journeyP99, 1)}ms`,
      W
    ) +
    picocolors.bold(picocolors.cyan("║"))
  );

  lines.push(picocolors.bold(picocolors.cyan("╠" + "═".repeat(W) + "╣")));
  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    picocolors.bold(picocolors.yellow(pad("  Step-by-Step Waterfall Performance Breakdown:", W))) +
    picocolors.bold(picocolors.cyan("║"))
  );
  lines.push(picocolors.bold(picocolors.cyan("╠" + "═".repeat(W) + "╣")));

  // Table header
  const th = `  ${pad("#", 3)} ${pad("Step Name", 28)} ${pad("Method", 6)} ${pad("Req/s", 8, true)} ${pad("p50", 8, true)} ${pad("p95", 8, true)} ${pad("p99", 8, true)} ${pad("Err%", 7, true)}`;
  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    picocolors.bold(picocolors.dim(pad(th, W))) +
    picocolors.bold(picocolors.cyan("║"))
  );
  lines.push(
    picocolors.bold(picocolors.cyan("║")) +
    picocolors.dim("  " + "─".repeat(W - 4)) + "  " +
    picocolors.bold(picocolors.cyan("║"))
  );

  summary.steps.forEach((step, idx) => {
    const errPct = fmt(step.errorRate * 100, 1) + "%";
    const errCol = step.errorRate > 0 ? picocolors.red : picocolors.green;
    const stepName = step.name.length > 28 ? step.name.substring(0, 25) + "..." : step.name;
    const errPadded = errCol(pad(errPct, 7, true));
    const prefix = `  ${pad(String(idx + 1), 3)} ${pad(stepName, 28)} ${pad(step.method, 6)} ${pad(fmt(step.rps, 1), 8, true)} ${pad(fmt(step.p50, 1) + "ms", 8, true)} ${pad(fmt(step.p95, 1) + "ms", 8, true)} ${pad(fmt(step.p99, 1) + "ms", 8, true)} `;

    lines.push(
      picocolors.bold(picocolors.cyan("║")) +
      prefix +
      errPadded +
      "  " +
      picocolors.bold(picocolors.cyan("║"))
    );
  });

  lines.push(picocolors.bold(picocolors.cyan("╚" + "═".repeat(W) + "╝")));
  lines.push("");

  return lines.join("\n");
}

/**
 * Prints the formatted scenario report directly to stdout.
 */
export function printScenarioTerminalReport(summary: ScenarioSummary): void {
  console.log(formatScenarioTerminalReport(summary));
}
