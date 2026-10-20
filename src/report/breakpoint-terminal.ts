import picocolors from "picocolors";
import type { BreakpointSummary, BreakpointStepResult } from "../types.js";

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

/**
 * Format a single step table row for real-time progress logging.
 */
export function formatStepRow(step: BreakpointStepResult, mode: "concurrency" | "rate"): string {
  const loadUnit = mode === "concurrency" ? "conn" : "req/s";
  const loadStr = `${step.load} ${loadUnit}`;
  const rpsStr = `${fmt(step.rps, 1)}/s`;
  const p50Str = fmt(step.p50, 1);
  const p95Str = fmt(step.p95, 1);
  const p99Str = fmt(step.p99, 1);
  const errStr = `${fmt(step.errorRate * 100, 2)}%`;

  let statusBadge = "";
  if (step.status === "PASS") {
    statusBadge = picocolors.green("✅ PASS");
  } else {
    const reason = step.breachReason ? ` (${step.breachReason})` : "";
    statusBadge = picocolors.red(`❌ BREACH${reason}`);
  }

  const prefix = step.isRefinement ? picocolors.cyan("•") : " ";
  return (
    ` ${prefix} ${pad(step.stepIndex.toString(), 3, true)} │ ` +
    `${pad(loadStr, 11)} │ ` +
    `${pad(rpsStr, 10, true)} │ ` +
    `${pad(p50Str, 8, true)} │ ` +
    `${pad(p95Str, 8, true)} │ ` +
    `${pad(p99Str, 8, true)} │ ` +
    `${pad(errStr, 8, true)} │ ` +
    `${statusBadge}`
  );
}

/**
 * Generates a comprehensive terminal report string for Breaking-Point results.
 */
export function formatBreakpointTerminalReport(summary: BreakpointSummary): string {
  const lines: string[] = [];
  const divider = picocolors.dim("─".repeat(78));

  lines.push("");
  lines.push(divider);
  lines.push(
    picocolors.bold(picocolors.cyan(" LoadScope Breaking-Point Capacity Analysis ")) +
      picocolors.dim(`• ${summary.target}`)
  );
  lines.push(divider);

  const loadType = summary.mode === "concurrency" ? "Connections" : "Target Rate (req/s)";
  lines.push(
    ` ${picocolors.dim("Mode:")}          ${summary.mode.toUpperCase()} (${loadType})` +
      `    ${picocolors.dim("Step Duration:")} ${summary.stepDurationSec}s per step`
  );
  lines.push(
    ` ${picocolors.dim("Ramp Range:")}    ${summary.start} ➔ ${summary.max} (step size: ${summary.step})` +
      `    ${picocolors.dim("Total Steps:")}   ${summary.steps.length + summary.refinementSteps.length}`
  );

  const limitsDesc: string[] = [];
  if (summary.limits.maxP95 !== undefined) limitsDesc.push(`p95 ≤ ${summary.limits.maxP95}ms`);
  if (summary.limits.maxP99 !== undefined) limitsDesc.push(`p99 ≤ ${summary.limits.maxP99}ms`);
  limitsDesc.push(`Errors ≤ ${(summary.limits.maxErrorRate * 100).toFixed(1)}%`);
  lines.push(` ${picocolors.dim("SLA Limits:")}    ${picocolors.yellow(limitsDesc.join(" | "))}`);
  lines.push("");

  // Table Header
  lines.push(picocolors.dim(" ┌─────┬─────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┐"));
  lines.push(
    picocolors.bold(
      ` │ ${pad("Step", 3)} │ ${pad("Load", 11)} │ ${pad("Throughput", 10)} │ ${pad("p50 (ms)", 8)} │ ${pad("p95 (ms)", 8)} │ ${pad("p99 (ms)", 8)} │ ${pad("Errors", 8)} │ ${pad("Outcome", 27)} │`
    )
  );
  lines.push(picocolors.dim(" ├─────┼─────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼─────────────────────────────┤"));

  // Stepped Ramp Steps
  for (const step of summary.steps) {
    lines.push(formatStepRow(step, summary.mode));
  }

  // Refinement Steps (if any)
  if (summary.refinementSteps.length > 0) {
    lines.push(picocolors.dim(" ├─────┴─────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────────────┤"));
    lines.push(picocolors.italic(picocolors.cyan(" │ Refinement Phase (Binary Search Convergence):                                                            │")));
    lines.push(picocolors.dim(" ├─────┬─────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┤"));
    for (const step of summary.refinementSteps) {
      lines.push(formatStepRow(step, summary.mode));
    }
  }

  lines.push(picocolors.dim(" └─────┴─────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────────────┘"));
  lines.push("");

  // Findings & Decision Banner
  const unit = summary.mode === "concurrency" ? "concurrent connections" : "req/sec";
  if (summary.breached && summary.breakingPoint !== undefined) {
    lines.push(
      picocolors.red(
        picocolors.bold(` 🎯 BREAKING POINT DETECTED: ${summary.breakingPoint} ${unit}`)
      )
    );
    if (summary.breachReason) {
      lines.push(picocolors.dim(`    Trigger: `) + picocolors.red(summary.breachReason));
    }
    lines.push("");
    lines.push(
      picocolors.green(
        picocolors.bold(` 🛡️  RECOMMENDED SAFE CEILING (80% headroom): ${summary.safeCapacity} ${unit}`)
      )
    );
    lines.push(
      picocolors.dim(
        `    System sustained load below this threshold without SLA latency or error budget violations.`
      )
    );
  } else {
    lines.push(
      picocolors.green(
        picocolors.bold(` 🎯 NO BREAKING POINT REACHED up to maximum ceiling of ${summary.max} ${unit}!`)
      )
    );
    lines.push(
      picocolors.dim(
        `    Target passed all SLA thresholds across all tested load levels. Increase --max to test higher capacity.`
      )
    );
  }

  lines.push(divider);
  lines.push("");
  return lines.join("\n");
}

/**
 * Print the Breaking-Point report to stdout.
 */
export function printBreakpointTerminalReport(summary: BreakpointSummary): void {
  console.log(formatBreakpointTerminalReport(summary));
}
