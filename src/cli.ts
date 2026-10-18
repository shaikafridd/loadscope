#!/usr/bin/env node
import { Command } from "commander";
import picocolors from "picocolors";
import { run } from "./index.js";
import { printTerminalReport } from "./report/terminal.js";
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
  .option("--pdf <path>", "Generate a PDF report at the specified path")
  .option("--ai-report <path>", "Generate a PDF report including AI analysis (requires LLM_API_KEY)")
  .option("--ai-dry-run", "Preview prompt that would be sent to LLM without calling API")
  .action(async (options) => {
    try {
      console.log(picocolors.cyan(`\n🚀 Initializing LoadScope runner against ${picocolors.bold(options.url)}...`));
      console.log(
        picocolors.dim(
          `   Concurrency: ${options.concurrency} | Duration: ${options.duration} | Method: ${options.method.toUpperCase()}`
        )
      );

      const headers = options.header ? parseHeaders(options.header) : undefined;

      const summary = await run({
        url: options.url,
        concurrency: parseInt(options.concurrency, 10),
        duration: options.duration,
        method: options.method.toUpperCase(),
        headers,
        body: options.body,
        pdf: options.pdf,
        aiReport: options.aiReport,
        aiDryRun: options.aiDryRun,
      });

      printTerminalReport(summary);
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("\n" + picocolors.red(`❌ LoadScope execution failed: ${errorMsg}\n`));
      process.exit(1);
    }
  });

program.parse(process.argv);
