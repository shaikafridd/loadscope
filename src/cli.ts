#!/usr/bin/env node
import { Command } from "commander";
import picocolors from "picocolors";
import fs from "node:fs/promises";
import { run, runBreakingPoint } from "./index.js";
import { printTerminalReport } from "./report/terminal.js";
import { printBreakpointTerminalReport, formatStepRow } from "./report/breakpoint-terminal.js";
import {
  formatJsonReport,
  formatCsvReport,
  formatBreakpointJsonReport,
  formatBreakpointCsvReport,
} from "./report/export.js";
import { parseHeaders } from "./config/schema.js";

const program = new Command();

program
  .name("loadscope")
  .description("A high-performance load-testing CLI with breaking-point finder and CI regression gate")
  .version("0.1.0");

// Subcommand: break / breakpoint
program
  .command("break <url>")
  .alias("breakpoint")
  .description("Automatically find the breaking-point and maximum safe capacity")
  .option("--start <number>", "Initial load (concurrency or rate)", "10")
  .option("--max <number>", "Maximum ceiling load to test", "100")
  .option("--step <number>", "Step increment", "10")
  .option("--step-duration <duration>", "Evaluation duration for each step", "5s")
  .option("--max-p95 <ms>", "Max p95 latency before breach (ms)", "300")
  .option("--max-p99 <ms>", "Max p99 latency before breach (ms)")
  .option("--max-errors <pct>", "Max error rate percentage before breach (e.g. 1.0)", "1.0")
  .option("-m, --mode <mode>", "Load type: 'concurrency' or 'rate'", "concurrency")
  .option("--no-refine", "Disable binary search refinement")
  .option("--tolerance <number>", "Binary search precision tolerance", "2")
  .option("-W, --workers <number|auto>", "Worker threads count")
  .option("-H, --header <headers...>", "Custom HTTP header(s)")
  .option("-b, --body <body>", "HTTP request body")
  .option("--method <method>", "HTTP method (GET, POST, etc.)", "GET")
  .option("--timeout <duration>", "Request timeout", "10s")
  .option("--honest", "Enable Gil Tene Coordinated Omission correction", true)
  .option("--distribution <distribution>", "Arrival process ('uniform' or 'poisson')", "uniform")
  .option("--json [path]", "Export machine-readable JSON summary report (to path or stdout)")
  .option("--csv [path]", "Export machine-readable CSV report (to path or stdout)")
  .action(async (url, options) => {
    try {
      const isSilentStdout = options.json === true || options.csv === true;

      if (!isSilentStdout) {
        console.log(
          picocolors.cyan(
            `\n🔍 Initializing LoadScope Breaking-Point Finder against ${picocolors.bold(url)}...`
          )
        );
        console.log(
          picocolors.dim(
            `   Ramp: ${options.start} ➔ ${options.max} (step: ${options.step}) | Step Duration: ${options.stepDuration} | Max p95: ${options.maxP95}ms | Max Errors: ${options.maxErrors}%`
          )
        );
        console.log("");
      }

      const headers = options.header ? parseHeaders(options.header) : undefined;
      const maxErrorRate = parseFloat(options.maxErrors) / 100;

      const summary = await runBreakingPoint({
        url,
        mode: options.mode as "concurrency" | "rate",
        start: parseInt(options.start, 10),
        max: parseInt(options.max, 10),
        step: parseInt(options.step, 10),
        stepDuration: options.stepDuration,
        maxP95: options.maxP95 ? parseFloat(options.maxP95) : undefined,
        maxP99: options.maxP99 ? parseFloat(options.maxP99) : undefined,
        maxErrorRate,
        refine: options.refine !== false,
        tolerance: parseInt(options.tolerance, 10),
        workers: options.workers === "auto" ? "auto" : options.workers ? parseInt(options.workers, 10) : 1,
        method: options.method.toUpperCase(),
        headers,
        body: options.body,
        timeout: options.timeout,
        honest: options.honest,
        distribution: options.distribution,
        onStepStart: (stepNum, load, isRefinement) => {
          if (!isSilentStdout) {
            const label = isRefinement ? "Refining" : "Testing";
            process.stdout.write(picocolors.dim(`   [${stepNum}] ${label} load = ${load}... `));
          }
        },
        onStepComplete: (result) => {
          if (!isSilentStdout) {
            process.stdout.write("\r");
            console.log(formatStepRow(result, options.mode));
          }
        },
      });

      // Handle machine-readable JSON output
      if (typeof options.json === "string") {
        await fs.writeFile(options.json, formatBreakpointJsonReport(summary), "utf-8");
        console.log(picocolors.green(`\n📄 Saved JSON report to: ${options.json}`));
      } else if (options.json === true) {
        console.log(formatBreakpointJsonReport(summary));
      }

      // Handle machine-readable CSV output
      if (typeof options.csv === "string") {
        await fs.writeFile(options.csv, formatBreakpointCsvReport(summary), "utf-8");
        console.log(picocolors.green(`\n📊 Saved CSV report to: ${options.csv}`));
      } else if (options.csv === true) {
        console.log(formatBreakpointCsvReport(summary));
      }

      if (!isSilentStdout) {
        printBreakpointTerminalReport(summary);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("\n" + picocolors.red(`❌ LoadScope breakpoint execution failed: ${errorMsg}\n`));
      process.exit(1);
    }
  });

// Root default command: loadscope [options]
program
  .option("-u, --url <url>", "Target URL to test (e.g. http://localhost:3000)")
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
  .option("--break", "Run in breaking-point finder mode")
  .option("--start <number>", "Initial load for breaking-point mode", "10")
  .option("--max <number>", "Maximum ceiling load for breaking-point mode", "100")
  .option("--step <number>", "Step increment for breaking-point mode", "10")
  .option("--step-duration <duration>", "Duration per step for breaking-point mode", "5s")
  .option("--max-p95 <ms>", "Max p95 latency before breach (ms)", "300")
  .option("--max-p99 <ms>", "Max p99 latency before breach (ms)")
  .option("--max-errors <pct>", "Max error rate percentage before breach (e.g. 1.0)", "1.0")
  .option("--json [path]", "Export machine-readable JSON summary report (to path or stdout)")
  .option("--csv [path]", "Export machine-readable CSV summary and time-series report (to path or stdout)")
  .option("--pdf <path>", "Generate a PDF report at the specified path")
  .option("--ai-report <path>", "Generate a PDF report including AI analysis (requires LLM_API_KEY)")
  .option("--ai-dry-run", "Preview prompt that would be sent to LLM without calling API")
  .action(async (options) => {
    if (!options.url) {
      program.help();
      return;
    }

    try {
      const isSilentStdout = options.json === true || options.csv === true;

      // Check if user requested --break flag on the root command
      if (options.break) {
        const headers = options.header ? parseHeaders(options.header) : undefined;
        const maxErrorRate = parseFloat(options.maxErrors || "1.0") / 100;
        const summary = await runBreakingPoint({
          url: options.url,
          mode: (options.mode === "open" || options.rate) ? "rate" : "concurrency",
          start: parseInt(options.start, 10),
          max: parseInt(options.max, 10),
          step: parseInt(options.step, 10),
          stepDuration: options.stepDuration,
          maxP95: options.maxP95 ? parseFloat(options.maxP95) : undefined,
          maxP99: options.maxP99 ? parseFloat(options.maxP99) : undefined,
          maxErrorRate,
          refine: true,
          workers: options.workers === "auto" ? "auto" : options.workers ? parseInt(options.workers, 10) : 1,
          method: options.method.toUpperCase(),
          headers,
          body: options.body,
          timeout: options.timeout,
          honest: options.honest,
          distribution: options.distribution,
        });

        if (typeof options.json === "string") {
          await fs.writeFile(options.json, formatBreakpointJsonReport(summary), "utf-8");
          console.log(picocolors.green(`\n📄 Saved JSON report to: ${options.json}`));
        } else if (options.json === true) {
          console.log(formatBreakpointJsonReport(summary));
        }

        if (typeof options.csv === "string") {
          await fs.writeFile(options.csv, formatBreakpointCsvReport(summary), "utf-8");
          console.log(picocolors.green(`\n📊 Saved CSV report to: ${options.csv}`));
        } else if (options.csv === true) {
          console.log(formatBreakpointCsvReport(summary));
        }

        if (!isSilentStdout) {
          printBreakpointTerminalReport(summary);
        }
        return;
      }

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
