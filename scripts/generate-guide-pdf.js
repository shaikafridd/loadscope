import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase0_Phase1_Learning_Guide.pdf");
const doc = new PDFDocument({
  size: "A4",
  margin: 45,
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Palette
const PRIMARY = "#1E293B"; // Slate 800
const BRAND = "#0284C7";   // Sky blue
const TEXT = "#334155";    // Slate 700
const MUTED = "#64748B";   // Slate 500
const BG_CODE = "#F8FAFC"; // Slate 50
const BORDER_CODE = "#E2E8F0";
const ACCENT = "#0D9488";  // Teal

// Formatting helpers
function addTitle(title) {
  doc.fontSize(22).fillColor(PRIMARY).font("Helvetica-Bold").text(title);
  doc.moveDown(0.4);
}

function addHeading(heading) {
  doc.addPage();
  doc.fontSize(16).fillColor(BRAND).font("Helvetica-Bold").text(heading);
  doc.moveDown(0.2);
  doc.rect(45, doc.y, 505, 1.5).fill(BRAND);
  doc.moveDown(0.6);
}

function addSubheading(subheading) {
  doc.moveDown(0.5);
  doc.fontSize(12).fillColor(PRIMARY).font("Helvetica-Bold").text(subheading);
  doc.moveDown(0.3);
}

function addParagraph(text) {
  doc.fontSize(9.5).fillColor(TEXT).font("Helvetica").text(text, {
    lineGap: 3,
    paragraphGap: 4,
  });
}

function addBullet(term, description) {
  const bulletX = 55;
  const contentX = 70;
  const currentY = doc.y;

  doc.fontSize(9).fillColor(BRAND).font("Helvetica-Bold").text("•", bulletX, currentY);
  doc.fontSize(9).fillColor(PRIMARY).font("Helvetica-Bold").text(term + ": ", contentX, currentY, { continued: true });
  doc.font("Helvetica").fillColor(TEXT).text(description, { lineGap: 2 });
  doc.moveDown(0.25);
}

function addCodeBlock(code) {
  const startY = doc.y + 4;
  const codeLines = code.split("\n");
  const blockHeight = codeLines.length * 11 + 14;

  if (startY + blockHeight > 770) {
    doc.addPage();
  }

  const y = doc.y + 4;
  doc.rect(45, y, 505, blockHeight).fillAndStroke(BG_CODE, BORDER_CODE);
  doc.fontSize(8).fillColor("#0F172A").font("Courier");
  
  let lineY = y + 7;
  for (const line of codeLines) {
    doc.text(line, 55, lineY, { width: 485 });
    lineY += 11;
  }
  doc.y = y + blockHeight + 6;
}

function addCallout(title, text) {
  const startY = doc.y + 4;
  const textHeight = 40;
  if (startY + textHeight > 770) {
    doc.addPage();
  }
  const y = doc.y + 4;
  doc.rect(45, y, 505, 46).fillAndStroke("#F0FDF4", "#86EFAC");
  doc.fontSize(9.5).fillColor("#166534").font("Helvetica-Bold").text(`💡 ${title}`, 55, y + 6);
  doc.fontSize(8.5).fillColor("#14532D").font("Helvetica").text(text, 55, y + 20, { width: 485, lineGap: 2 });
  doc.y = y + 54;
}

// ==================== COVER / PAGE 1 ====================
doc.rect(45, 45, 505, 12).fill(BRAND);
doc.moveDown(2);
doc.fontSize(28).fillColor(PRIMARY).font("Helvetica-Bold").text("LoadScope Complete Guide");
doc.fontSize(14).fillColor(BRAND).font("Helvetica").text("Mastering Phase 0 (Foundation) & Phase 1 (Core Runner & DSA)");
doc.moveDown(0.5);
doc.fontSize(9.5).fillColor(MUTED).font("Helvetica").text("A comprehensive, line-by-line engineering breakdown for building a production-grade load testing CLI.");
doc.moveDown(1);

addTitle("Executive Architecture Overview");
addParagraph(
  "LoadScope is designed to be an ultra-fast, honest, fixed-memory load testing engine written in modern Node.js and TypeScript. Unlike traditional tools that suffer from coordinated omission, steep JVM memory overhead, or lack of automated CI gates, LoadScope focuses on four pillars: Honest Latency, Flat Memory Footprint, Self-Aware Diagnostics, and Script-Driven Reporting."
);

addCallout(
  "Core Architectural Philosophy",
  "1. Fixed Memory: A fixed 4.8 KB log-histogram handles 10 or 100M requests with flat RAM.\n2. Honest Numbers: Measures latency from scheduled dispatch time, not socket availability.\n3. Zero Dependency Bloat: Runs via npx with minimal overhead on any machine."
);

addSubheading("High-Level Working Pipeline");
addBullet("CLI / Config Parsing", "Validates URL, load model, thresholds, and duration using Zod.");
addBullet("Worker Threads Pool", "Spreads traffic generation across N - 1 cores using undici connection pools.");
addBullet("Log-Bucketed Histogram", "Records latency in microseconds inside fixed 1,200 Uint32Array buckets.");
addBullet("Second-by-Second Merge", "Workers send delta snapshots to the main thread for real-time aggregation.");
addBullet("Multi-Layer Reporting", "Generates interactive terminal UI, JSON, standalone HTML with Chart.js, and offline PDF.");

// ==================== PAGE 2: PHASE 0 LINE-BY-LINE ====================
addHeading("Phase 0: Project Initiation & Tooling (Line-by-Line)");

addParagraph(
  "Phase 0 establishes the engineering bedrock: pure ES Module structure, strict TypeScript compilation, dual-entry bundling with tsup, automated testing with Vitest, and a controllable mock HTTP server. Below is the line-by-line explanation of every configuration."
);

addSubheading("1. package.json Breakdown");
addParagraph("The package manifest defines how LoadScope runs as both a CLI tool (`npx loadscope`) and an importable library (`import { run } from 'loadscope'`).");

addCodeBlock(`{
  "name": "loadscope",             // Package name (verified available on npm via 404)
  "version": "0.1.0",              // Initial SemVer release version
  "type": "module",                // Enforces native ECMAScript Modules (ESM) everywhere
  "bin": {
    "loadscope": "dist/cli.js"     // Registers the executable CLI command for npx and global npm
  },
  "main": "dist/index.js",         // Entry point for programmatic usage in Node.js scripts
  "types": "dist/index.d.ts",      // TypeScript declaration map for autocomplete and type safety
  "files": ["dist", "README.md", "LICENSE"], // Only upload compiled binaries and docs to npm
  "engines": { "node": ">=20" }    // Requires Node 20 LTS for native fetch and worker stability
}`);

addBullet('"type": "module"', "Ensures `import/export` syntax works natively across Node.js without legacy CommonJS (`require`).");
addBullet('"bin" mapping', "Tells npm to link `dist/cli.js` to the system PATH so running `npx loadscope` executes the CLI directly.");
addBullet('"files" array', "Crucial for npm publishing. Prevents cluttering user machines with source files, tests, or config files.");

addSubheading("2. TypeScript Configuration (tsconfig.json)");
addCodeBlock(`{
  "compilerOptions": {
    "target": "ES2022",            // Modern JavaScript features (class fields, Array.at, etc.)
    "module": "NodeNext",          // Emits Node-compatible ESM imports (.js extensions)
    "moduleResolution": "NodeNext",// Modern algorithm matching Node's package.json exports
    "strict": true,                // Enables strictNullChecks, noImplicitAny, strictBindCallApply
    "declaration": true,           // Emits .d.ts files so consumers have full autocomplete
    "skipLibCheck": true           // Speeds up compilation by skipping third-party type checks
  }
}`);

// ==================== PAGE 3: PHASE 0 CONTINUED ====================
addHeading("Phase 0: Bundler, Mock Server & CI Workflows");

addSubheading("3. Bundling with tsup (tsup.config.ts)");
addParagraph(
  "tsup is powered by esbuild. It bundles TypeScript into clean ES modules in milliseconds, preserves CLI shebangs, and automatically emits TypeScript declaration files without running full tsc overhead."
);

addCodeBlock(`import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"], // Dual entry: CLI binary and programmatic library
  format: ["esm"],                       // Modern ES Module output
  dts: true,                             // Emits dist/index.d.ts and dist/cli.d.ts
  clean: true,                           // Purges dist/ folder before every build
  target: "node20",                      // Optimizes syntax for Node.js 20+
  shims: true                            // Provides ESM compatibility helpers (import.meta.url)
});`);

addSubheading("4. Controllable Mock Server (test-server/index.ts)");
addParagraph(
  "A load tester cannot be tested against external websites (unpredictable internet latency and legal limits). Phase 0 includes a controllable native HTTP server to verify behaviors under known conditions:"
);

addBullet("GET /", "Immediate 200 OK: Verifies baseline request throughput and minimal parsing overhead.");
addBullet("GET /delay/:ms", "Simulated Latency: Deliberately holds response using `setTimeout(..., ms)` to verify timing accuracy.");
addBullet("GET /error?status=500", "Simulated Failures: Emits HTTP 500/503 status codes to test error-rate thresholds.");
addBullet("GET /stall", "Hanging Socket: Keeps connection alive without responding to test stall detection and coordinated omission.");

addSubheading("5. Continuous Integration (.github/workflows/ci.yml)");
addParagraph(
  "Every pull request runs automated tests across a matrix of Node.js 20.x and 22.x on clean Ubuntu runners. If any test fails or the TypeScript build errors, merging is blocked automatically."
);

// ==================== PAGE 4: PHASE 1 CORE RUNNER & DSA ====================
addHeading("Phase 1: Core Runner & Histogram DSA");

addParagraph(
  "Phase 1 is where the actual load testing begins. It implements a single-threaded, closed-model runner using undici, paired with the heart of LoadScope's data structures: the Fixed-Memory Log-Bucketed Histogram."
);

addSubheading("1. The Data Structure Problem: Naive Arrays vs. Histograms");
addParagraph(
  "Why can't we just store latencies in an array: `latencies.push(duration)`?\n" +
  "If a test sends 50,000 requests per second for 5 minutes, that is 15,000,000 numbers in memory! In V8 (Node.js), an array of 15 million 64-bit floats consumes over 120 MB of RAM, triggers aggressive Garbage Collection (GC) pauses, and skews the very latency measurements we are trying to record."
);

addSubheading("2. The Fixed-Memory Solution: Logarithmic Bucketing");
addParagraph(
  "Instead of storing every individual latency, we partition latency into 1,200 exponential buckets. Latencies grow geometrically by a factor of 1.02 (2% error margin)."
);

addCodeBlock(`const GROWTH = 1.02;
const BUCKETS = 1200; // 1.02^1200 is ~21,000,000,000 microseconds (~5.8 hours!)

export class Histogram {
  counts = new Uint32Array(BUCKETS); // Exactly 1,200 * 4 bytes = 4.8 KB forever!
  total = 0;

  // Maps any latency in microseconds (us) to an array bucket index in O(1)
  private idx(us: number): number {
    return Math.min(
      BUCKETS - 1, 
      Math.floor(Math.log(Math.max(us, 1)) / Math.log(GROWTH))
    );
  }

  // Record: increment the count in that bucket in O(1) time
  record(us: number) {
    this.counts[this.idx(us)]++;
    this.total++;
  }
}`);

addCallout(
  "Why 4.8 KB Stays Flat Forever",
  "Because the array length is fixed at 1,200 elements, memory usage is completely constant. Whether you record 10 requests or 100 million requests, the histogram uses exactly 4,800 bytes of memory. Zero garbage collection pauses!"
);

// ==================== PAGE 5: HISTOGRAM ALGORITHMS & CLOSED MODEL ====================
addHeading("Phase 1: Percentile Extraction & Closed Model Runner");

addSubheading("3. Percentile Calculation Algorithm (p50, p95, p99)");
addParagraph(
  "To calculate percentiles (e.g., p95 = latency that 95% of requests beat), we compute the target count: `Math.ceil(0.95 * total)`. Then, we walk the 1,200 buckets cumulatively until the sum reaches the target:"
);

addCodeBlock(`percentile(p: number): number {
  if (this.total === 0) return 0;
  const target = Math.ceil((p / 100) * this.total);
  let seen = 0;

  for (let i = 0; i < BUCKETS; i++) {
    seen += this.counts[i];
    if (seen >= target) {
      // Reconstruct microsecond latency from bucket index:
      return Math.pow(GROWTH, i + 1);
    }
  }
  return 0;
}`);

addSubheading("4. Multi-Thread Merging: O(B) Vector Addition");
addParagraph(
  "In Phase 2, workers will generate load on separate CPU cores. Merging their results on the main thread is trivial and fast: add their counts together element-by-element."
);

addCodeBlock(`merge(other: Histogram) {
  for (let i = 0; i < BUCKETS; i++) {
    this.counts[i] += other.counts[i];
  }
  this.total += other.total;
}`);

addSubheading("5. Closed-Model Concurrency with undici");
addParagraph(
  "What is the Closed Model?\n" +
  "In the closed model, concurrency is fixed (e.g., concurrency = 100). The runner maintains exactly 100 concurrent workers. Each worker sends an HTTP request, waits for the response, records the duration in microseconds, and immediately loops to dispatch the next request until the test duration expires."
);

addBullet("undici.Pool", "High-performance connection pool keeping TCP sockets open with HTTP keep-alive.");
addBullet("process.hrtime.bigint()", "Nanosecond-precision monotonic timer. Unaffected by system clock adjustments or NTP jumps.");
addBullet("Status Code Map", "Tracks HTTP 200, 404, 500 counts in a compact hash map.");

// ==================== PAGE 6: PHASE 1 SUMMARY & CHECKLIST ====================
addHeading("Phase 1 Checkpoint & Week-by-Week Roadmap");

addSubheading("Phase 1 Checkpoint: Matching autocannon within 5%");
addParagraph(
  "The definition of done for Phase 1 is benchmarking LoadScope side-by-side with autocannon on the same server and hardware. Your throughput and p50/p95 numbers should be within 5% of autocannon."
);

addSubheading("Full Project Roadmap Quick Reference");
addBullet("Phase 0 (Done)", "Scaffolding, TypeScript, tsup, Vitest, mock server, CI workflows.");
addBullet("Phase 1 (Next)", "Single-thread runner, closed model, undici, custom histogram, summary reporting.");
addBullet("Phase 2", "Worker threads, multi-core scaling, histogram merging, live terminal dashboard.");
addBullet("Phase 3", "Honest latency, open model (fixed arrival rate), coordinated omission correction.");
addBullet("Phase 4", "Breaking-point finder (stepped ramp + binary search capacity detection).");
addBullet("Phase 5", "Baseline comparison and automated CI regression gate.");
addBullet("Phase 6", "Offline script-built PDF reports (pdfkit) + optional LLM analysis page.");
addBullet("Phase 7 & 8", "HTML report, GIF demo, npm publish 0.1.0, and open-source release.");

addCallout(
  "Golden Rule for DSA & System Design",
  "Write clean, deterministic code. Every number reported by LoadScope must be mathematically sound. When interviewers or senior engineers ask how LoadScope handles millions of requests without memory leaks, explain the 1,200 Uint32Array log-bucketed histogram."
);

// Add page numbers footer to all pages
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Educational Guide | Phase 0 & Phase 1 — Page ${i + 1} of ${totalPages}`,
    45,
    795,
    { align: "center", width: 505 }
  );
}

doc.end();

writeStream.on("finish", () => {
  console.log(`[PDF Generator] Successfully written PDF to ${outputPath}`);
});
