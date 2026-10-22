#!/usr/bin/env node
import { Command } from "commander";
import picocolors from "picocolors";
import fs from "node:fs/promises";
import {
  run,
  runBreakingPoint,
  generatePdfReport,
  buildAiDiagnosticPrompt,
  fetchAiDiagnostic,
  generateHtmlReport,
} from "./index.js";
import { printTerminalReport } from "./report/terminal.js";
import { printBreakpointTerminalReport, formatStepRow } from "./report/breakpoint-terminal.js";
import {
  formatJsonReport,
  formatCsvReport,
  formatBreakpointJsonReport,
  formatBreakpointCsvReport,
  formatComparisonJsonReport,
  formatComparisonCsvReport,
} from "./report/export.js";
import { parseHeaders } from "./config/schema.js";
import { saveBaseline, loadBaseline, compareRuns } from "./modes/regression-gate.js";
import {
  printComparisonTerminalReport,
  writeGithubStepSummary,
} from "./report/compare-terminal.js";

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

// Subcommand: compare <current> <baseline>
program
  .command("compare <current> <baseline>")
  .description("Compare two performance JSON reports against regression tolerances")
  .option("--max-p95-increase <pct>", "Allowable percentage increase in p95 latency", "10")
  .option("--max-rps-drop <pct>", "Allowable percentage drop in throughput", "5")
  .option("--max-p99-increase <pct>", "Allowable percentage increase in p99 latency")
  .option("--max-errors <pct>", "Max error rate percentage before regression (e.g. 1.0)", "1.0")
  .option("--json [path]", "Export machine-readable comparison JSON (to path or stdout)")
  .option("--csv [path]", "Export machine-readable comparison CSV (to path or stdout)")
  .action(async (currentPath, baselinePath, options) => {
    try {
      const isSilentStdout = options.json === true || options.csv === true;

      const currentRaw = JSON.parse(await fs.readFile(currentPath, "utf-8"));
      const baselineRaw = JSON.parse(await fs.readFile(baselinePath, "utf-8"));

      const comparison = compareRuns(currentRaw, baselineRaw, {
        maxP95IncreasePct: parseFloat(options.maxP95Increase),
        maxRpsDropPct: parseFloat(options.maxRpsDrop),
        maxP99IncreasePct: options.maxP99Increase ? parseFloat(options.maxP99Increase) : undefined,
        maxErrorRate: options.maxErrors ? parseFloat(options.maxErrors) / 100 : 0.01,
      });

      if (typeof options.json === "string") {
        await fs.writeFile(options.json, formatComparisonJsonReport(comparison), "utf-8");
        console.log(picocolors.green(`\n📄 Saved comparison JSON to: ${options.json}`));
      } else if (options.json === true) {
        console.log(formatComparisonJsonReport(comparison));
      }

      if (typeof options.csv === "string") {
        await fs.writeFile(options.csv, formatComparisonCsvReport(comparison), "utf-8");
        console.log(picocolors.green(`\n📊 Saved comparison CSV to: ${options.csv}`));
      } else if (options.csv === true) {
        console.log(formatComparisonCsvReport(comparison));
      }

      if (!isSilentStdout) {
        printComparisonTerminalReport(comparison);
      }

      await writeGithubStepSummary(comparison);

      if (!comparison.passed) {
        process.exit(1);
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("\n" + picocolors.red(`❌ LoadScope compare failed: ${errorMsg}\n`));
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
  .option("--baseline <path>", "Compare test results against a baseline JSON file and fail on regression")
  .option("--save-baseline [path]", "Save the current test run as a baseline file (default: loadscope-baseline.json)")
  .option("--max-p95-increase <pct>", "Allowable percentage increase in p95 latency for baseline comparison", "10")
  .option("--max-rps-drop <pct>", "Allowable percentage drop in throughput for baseline comparison", "5")
  .option("--max-p99-increase <pct>", "Allowable percentage increase in p99 latency for baseline comparison")
  .option("--json [path]", "Export machine-readable JSON summary report (to path or stdout)")
  .option("--csv [path]", "Export machine-readable CSV summary and time-series report (to path or stdout)")
  .option("--html [path]", "Generate a self-contained interactive HTML report (default: loadscope-report.html)")
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

      // Phase 6: AI Dry Run
      if (options.aiDryRun) {
        const prompt = buildAiDiagnosticPrompt(summary);
        console.log(picocolors.cyan("\n🤖 LoadScope AI Diagnostic Prompt Preview (--ai-dry-run):"));
        console.log(picocolors.dim("─".repeat(70)));
        console.log(prompt);
        console.log(picocolors.dim("─".repeat(70)));
      }

      // Phase 6: PDF Report and AI Report Generation
      if (options.pdf || options.aiReport) {
        const pdfPath = typeof options.aiReport === "string" ? options.aiReport : options.pdf;
        let aiAnalysis: string | undefined;

        if (options.aiReport) {
          if (!isSilentStdout) {
            console.log(picocolors.cyan("\n🤖 Generating AI Performance Diagnostic..."));
          }
          aiAnalysis = await fetchAiDiagnostic(summary);
        }

        const resolvedPdf = await generatePdfReport(summary, pdfPath, aiAnalysis);
        if (!isSilentStdout) {
          console.log(picocolors.green(`\n📄 Generated vector PDF report: ${resolvedPdf}`));
        }
      }

      // Phase 7: Interactive HTML Report Generation
      if (options.html) {
        const htmlPath = typeof options.html === "string" ? options.html : "loadscope-report.html";
        const resolvedHtml = await generateHtmlReport(summary, htmlPath);
        if (!isSilentStdout) {
          console.log(picocolors.green(`\n🌐 Generated interactive HTML report: ${resolvedHtml}`));
        }
      }

      // Phase 5: Baseline Saving
      if (options.saveBaseline) {
        const baselinePath =
          typeof options.saveBaseline === "string"
            ? options.saveBaseline
            : "loadscope-baseline.json";
        const savedTo = await saveBaseline(summary, baselinePath, {
          concurrency: parseInt(options.concurrency, 10),
          rate: options.rate ? parseFloat(options.rate) : undefined,
        });
        if (!isSilentStdout) {
          console.log(picocolors.green(`\n💾 Saved performance baseline to: ${savedTo}`));
        }
      }

      // Phase 5: CI Regression Gate Comparison
      if (options.baseline) {
        const baseline = await loadBaseline(options.baseline);
        const comparison = compareRuns(summary, baseline, {
          maxP95IncreasePct: parseFloat(options.maxP95Increase || "10"),
          maxRpsDropPct: parseFloat(options.maxRpsDrop || "5"),
          maxP99IncreasePct: options.maxP99Increase ? parseFloat(options.maxP99Increase) : undefined,
          maxErrorRate: options.maxErrors ? parseFloat(options.maxErrors) / 100 : 0.01,
        });

        if (!isSilentStdout) {
          printComparisonTerminalReport(comparison);
        }

        await writeGithubStepSummary(comparison);

        if (!comparison.passed) {
          process.exit(1);
        }
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("\n" + picocolors.red(`❌ LoadScope execution failed: ${errorMsg}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
