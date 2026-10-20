#!/usr/bin/env node
import { Command } from "commander";
import picocolors from "picocolors";
import fs from "node:fs/promises";
import { run } from "./index.js";
import { printTerminalReport } from "./report/terminal.js";
import { formatJsonReport, formatCsvReport } from "./report/export.js";
import { parseHeaders } from "./config/schema.js";

const program = new Command();

program
  .name("loadscope")
  .description("A high-performance load-testing CLI with breaking-point finder and CI regression gate")
  .version("0.1.0")
  .requiredOption("-u, --url <url>", "Target URL to test (e.g. http://localhost:3000)")
  .option("-c, --concurrency <number>", "Number of concurrent connections", "10")
  .option("-d, --duration <duration>", "Test duration (e.g. 10s, 1m, 500ms)", "10s")
  .option("-m, --method <method>", "HTTP method (GET, POST, PUT, DELETE)", "GET")
  .option("-H, --header <headers...>", "Custom HTTP header(s) (e.g. -H 'Authorization: Bearer token')")
  .option("-b, --body <body>", "HTTP request body")
  .option("-r, --rate <number>", "Requests per second (open arrival model)")
  .option("--distribution <distribution>", "Arrival process distribution ('uniform' or 'poisson')", "uniform")
  .option("--honest", "Enable Gil Tene Coordinated Omission correction")
  .option("--ttfb", "Track Time-To-First-Byte (TTFB) latency breakdown")
  .option("-w, --warmup <duration>", "Warmup duration before recording metrics (e.g. 2s)")
  .option("-W, --workers <number|auto>", "Number of worker threads for multi-core scaling (default: 1)")
  .option("--timeout <duration>", "Per-request timeout (e.g. 5s, 500ms)", "10s")
  .option("--ramp-up <duration>", "Ramp-up duration to stagger worker starts (e.g. 3s)")
  .option("--mode <mode>", "Execution model ('closed' or 'open')")
  .option("--dashboard", "Enable real-time interactive terminal dashboard", true)
  .option("--no-dashboard", "Disable real-time interactive terminal dashboard")
  .option("--json [path]", "Export machine-readable JSON summary report (to path or stdout)")
  .option("--csv [path]", "Export machine-readable CSV summary and time-series report (to path or stdout)")
  .option("--pdf <path>", "Generate a PDF report at the specified path")
  .option("--ai-report <path>", "Generate a PDF report including AI analysis (requires LLM_API_KEY)")
  .option("--ai-dry-run", "Preview prompt that would be sent to LLM without calling API")
  .action(async (options) => {
    try {
      const isSilentStdout = options.json === true || options.csv === true;

      if (!isSilentStdout) {
        console.log(picocolors.cyan(`\n🚀 Initializing LoadScope runner against ${picocolors.bold(options.url)}...`));
        const modeDesc = options.rate || options.mode === "open"
          ? `Open (${options.distribution.toUpperCase()} ${options.rate ?? 50} req/s)`
          : `Closed (${options.concurrency} conn)`;
        const workersDesc = options.workers ? ` | Workers: ${options.workers}` : "";
        const honestDesc = options.honest ? " | Honest CO: ON" : "";
        console.log(
          picocolors.dim(
            `   Mode: ${modeDesc}${workersDesc}${honestDesc} | Duration: ${options.duration} | Method: ${options.method.toUpperCase()}`
          )
        );
      }

      const headers = options.header ? parseHeaders(options.header) : undefined;

      const summary = await run({
        url: options.url,
        concurrency: parseInt(options.concurrency, 10),
        duration: options.duration,
        method: options.method.toUpperCase(),
        headers,
        body: options.body,
        rate: options.rate ? parseFloat(options.rate) : undefined,
        distribution: options.distribution,
        honest: options.honest,
        ttfb: options.ttfb,
        warmup: options.warmup,
        timeout: options.timeout,
        rampUp: options.rampUp,
        mode: options.mode,
        workers: options.workers === "auto" ? "auto" : options.workers ? parseInt(options.workers, 10) : 1,
        dashboard: isSilentStdout ? false : options.dashboard,
        json: options.json,
        csv: options.csv,
        pdf: options.pdf,
        aiReport: options.aiReport,
        aiDryRun: options.aiDryRun,
      });

      // Handle machine-readable JSON output
      if (typeof options.json === "string") {
        await fs.writeFile(options.json, formatJsonReport(summary), "utf-8");
        console.log(picocolors.green(`\n📄 Saved JSON report to: ${options.json}`));
      } else if (options.json === true) {
        console.log(formatJsonReport(summary));
      }

      // Handle machine-readable CSV output
      if (typeof options.csv === "string") {
        await fs.writeFile(options.csv, formatCsvReport(summary), "utf-8");
        console.log(picocolors.green(`\n📊 Saved CSV report to: ${options.csv}`));
      } else if (options.csv === true) {
        console.log(formatCsvReport(summary));
      }

      // Default terminal report when not piping raw JSON/CSV to stdout
      if (!isSilentStdout) {
        printTerminalReport(summary);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("\n" + picocolors.red(`❌ LoadScope execution failed: ${errorMsg}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
