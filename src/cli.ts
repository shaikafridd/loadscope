#!/usr/bin/env node
import { Command } from "commander";
import picocolors from "picocolors";
import { run } from "./index.js";

const program = new Command();

program
  .name("loadscope")
  .description("A high-performance load-testing CLI with breaking-point finder and CI regression gate")
  .version("0.1.0")
  .option("-u, --url <url>", "Target URL to test")
  .option("-c, --concurrency <number>", "Number of concurrent connections", "10")
  .option("-d, --duration <duration>", "Test duration (e.g. 10s, 1m)", "10s")
  .option("-r, --rate <number>", "Requests per second (open arrival model)")
  .option("--pdf <path>", "Generate a PDF report at the specified path")
  .option("--ai-report <path>", "Generate a PDF report including AI analysis (requires LLM_API_KEY)")
  .option("--ai-dry-run", "Preview prompt that would be sent to LLM without calling API")
  .action(async (options) => {
    if (!options.url) {
      console.error(picocolors.red("Error: --url is required"));
      process.exit(1);
    }

    console.log(picocolors.cyan(`\nStarting LoadScope test against ${picocolors.bold(options.url)}...`));
    console.log(picocolors.dim(`Concurrency: ${options.concurrency} | Duration: ${options.duration}`));

    const result = await run({
      url: options.url,
      concurrency: parseInt(options.concurrency, 10),
      pdf: options.pdf,
      aiReport: options.aiReport,
      aiDryRun: options.aiDryRun,
    });

    console.log(picocolors.green("Test completed successfully."));
  });

program.parse(process.argv);
