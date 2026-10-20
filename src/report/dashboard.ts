import logUpdate from "log-update";
import picocolors from "picocolors";

export interface DashboardStats {
  target: string;
  elapsedSec: number;
  totalDurationSec: number;
  totalRequests: number;
  currentRps: number;
  p50Ms: number;
  p90Ms: number;
  p95Ms: number;
  networkErrors: number;
  httpErrors: number;
  workerCount: number;
  mode: "closed" | "open";
  warnings?: string[];
}

/**
 * Real-time terminal dashboard powered by log-update.
 */
export class LiveDashboard {
  private enabled: boolean;

  constructor(enabled = true) {
    // Only enable if stdout is a TTY and user did not disable
    this.enabled = enabled && Boolean(process.stdout.isTTY);
  }

  /**
   * Format a progress bar like [████████░░░░░░] 60%
   */
  private renderProgressBar(percent: number, width = 24): string {
    const clamped = Math.max(0, Math.min(1, percent));
    const filled = Math.round(clamped * width);
    const empty = width - filled;
    const bar = picocolors.cyan("█".repeat(filled)) + picocolors.dim("░".repeat(empty));
    const pctStr = (clamped * 100).toFixed(0).padStart(3) + "%";
    return `[${bar}] ${picocolors.bold(pctStr)}`;
  }

  /**
   * Generates the dashboard text representation.
   */
  public formatDashboard(stats: DashboardStats): string {
    const lines: string[] = [];
    const divider = picocolors.dim("─".repeat(58));
    const progressPct = stats.totalDurationSec > 0 ? stats.elapsedSec / stats.totalDurationSec : 0;

    lines.push("");
    lines.push(divider);
    lines.push(
      picocolors.bold(picocolors.cyan(" LoadScope Live Monitor ")) +
        picocolors.dim(`• ${stats.target}`)
    );
    lines.push(divider);

    // Progress bar line
    const timeStr = `${stats.elapsedSec.toFixed(1)}s / ${stats.totalDurationSec.toFixed(1)}s`;
    lines.push(` ${this.renderProgressBar(progressPct)}  ${picocolors.dim(timeStr)}`);

    // Throughput & total requests
    lines.push(
      ` ${picocolors.dim("Throughput:")}  ${picocolors.green(picocolors.bold(stats.currentRps.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })))} req/s` +
        `   ${picocolors.dim("Total Requests:")} ${picocolors.bold(stats.totalRequests.toLocaleString("en-US"))}`
    );

    // Latency live percentiles
    const p50Str = picocolors.cyan(`${stats.p50Ms.toFixed(2)}ms`);
    const p90Str = picocolors.cyan(`${stats.p90Ms.toFixed(2)}ms`);
    const p95Str = stats.p95Ms > 300 ? picocolors.yellow(`${stats.p95Ms.toFixed(2)}ms`) : picocolors.cyan(`${stats.p95Ms.toFixed(2)}ms`);
    lines.push(
      ` ${picocolors.dim("Latency:")}     p50: ${p50Str}  p90: ${p90Str}  p95: ${p95Str}`
    );

    // Errors & workers
    const totalFailures = stats.networkErrors + stats.httpErrors;
    const errorRate = stats.totalRequests > 0 ? (totalFailures / stats.totalRequests) * 100 : 0;
    const errorColor = totalFailures > 0 ? picocolors.red : picocolors.green;
    const errorStr = errorColor(`${errorRate.toFixed(2)}% (${totalFailures.toLocaleString("en-US")} fails)`);

    lines.push(
      ` ${picocolors.dim("Error Rate:")}  ${errorStr}` +
        `    ${picocolors.dim("Workers:")} ${picocolors.bold(stats.workerCount.toString())} active`
    );

    // Warnings if any
    if (stats.warnings && stats.warnings.length > 0) {
      lines.push("");
      for (const w of stats.warnings) {
        lines.push(`   ${picocolors.yellow("⚠️ ")} ${w}`);
      }
    }

    lines.push(divider);
    return lines.join("\n");
  }

  /**
   * Update the live terminal display.
   */
  public update(stats: DashboardStats): void {
    if (!this.enabled) return;
    logUpdate(this.formatDashboard(stats));
  }

  /**
   * Stop the live dashboard and clean up terminal state.
   */
  public stop(): void {
    if (!this.enabled) return;
    logUpdate.clear();
    logUpdate.done();
  }
}
