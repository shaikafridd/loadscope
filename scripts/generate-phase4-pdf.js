import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase4_Complete_Mastery_Guide.pdf");
const doc = new PDFDocument({
  size: "A4",
  margin: 45,
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Color Palette
const PRIMARY = "#0F172A"; // Slate 900
const BRAND = "#0284C7";   // Sky blue
const BRAND_DARK = "#0369A1";
const TEXT = "#334155";    // Slate 700
const MUTED = "#64748B";   // Slate 500
const BG_CODE = "#F8FAFC"; // Slate 50
const BORDER_CODE = "#CBD5E1";
const CALLOUT_BG = "#F0FDF4";
const CALLOUT_BORDER = "#86EFAC";

// Helper Functions
function addPageHeader(title) {
  doc.addPage();
  doc.fontSize(16).fillColor(BRAND_DARK).font("Helvetica-Bold").text(title);
  doc.moveDown(0.2);
  doc.rect(45, doc.y, 505, 1.5).fill(BRAND);
  doc.moveDown(0.5);
}

function addSubheading(subheading) {
  doc.moveDown(0.4);
  doc.fontSize(11.5).fillColor(PRIMARY).font("Helvetica-Bold").text(subheading);
  doc.moveDown(0.25);
}

function addParagraph(text) {
  doc.fontSize(9.5).fillColor(TEXT).font("Helvetica").text(text, {
    lineGap: 3,
    paragraphGap: 5,
  });
}

function addBullet(term, definition) {
  doc.fontSize(9).fillColor(TEXT).font("Helvetica");
  doc.text(`• `, { continued: true });
  doc.font("Helvetica-Bold").fillColor(PRIMARY).text(`${term}: `, { continued: true });
  doc.font("Helvetica").fillColor(TEXT).text(definition, { lineGap: 2.5 });
  doc.moveDown(0.2);
}

function addCodeBlock(code) {
  const y = doc.y;
  doc.fontSize(7.5).font("Courier");
  const height = doc.heightOfString(code, { width: 485, lineGap: 1.5 }) + 14;

  doc.rect(45, y, 505, height).fillAndStroke(BG_CODE, BORDER_CODE);
  doc.fillColor(PRIMARY).text(code, 55, y + 7, { width: 485, lineGap: 1.5 });
  doc.y = y + height + 6;
}

function addCallout(title, text) {
  const y = doc.y;
  doc.fontSize(9).font("Helvetica");
  const height = doc.heightOfString(text, { width: 485, lineGap: 2.5 }) + 26;

  doc.rect(45, y, 505, height).fillAndStroke(CALLOUT_BG, CALLOUT_BORDER);
  doc.fontSize(9.5).fillColor(BRAND_DARK).font("Helvetica-Bold").text(title, 55, y + 6);
  doc.fontSize(8.5).fillColor(TEXT).font("Helvetica").text(text, 55, y + 20, { width: 485, lineGap: 2.5 });
  doc.y = y + height + 6;
}

// ==================== PAGE 1: TITLE & EXECUTIVE SUMMARY ====================
doc.rect(45, 45, 505, 120).fill("#F1F5F9");
doc.fontSize(22).fillColor(PRIMARY).font("Helvetica-Bold").text("LoadScope Engineering Guide", 60, 65);
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Phase 4: Breaking-Point Finder & Capacity Detection", 60, 93);
doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text("Universal Scalability Law • Little's Law Saturation • Binary Search Capacity Pinpointing", 60, 115);

doc.y = 180;
doc.fontSize(14).fillColor(BRAND_DARK).font("Helvetica-Bold").text("Executive Summary: Automated Capacity Engineering");
doc.rect(45, doc.y + 2, 505, 1).fill(BRAND);
doc.y += 10;

addParagraph(
  "Most load testing tools require engineers to guess load levels manually. An engineer might test 100 concurrent connections, then 200, then 500, inspecting charts by hand to identify where performance collapsed. Phase 4 equips LoadScope with an automated breaking-point finder that deterministically detects the exact capacity boundaries of any service."
);

addParagraph(
  "The engine combines two algorithmic stages: a Stepped Ramp Phase to discover the failure region, followed by a Binary Search Refinement Phase to converge on the precise breaking threshold. It computes not only the breaking point, but also a mathematically grounded Recommended Safe Production Ceiling (applying the standard 80% capacity headroom)."
);

addSubheading("Core Architectural Components in Phase 4");
addBullet("Stepped Ramp Engine", "Iteratively steps load from start to max, executing controlled test windows and evaluating SLA thresholds.");
addBullet("SLA & Error Budget Gate", "Continuously checks p95 latency, p99 latency, and failure rates against configurable performance ceilings.");
addBullet("Binary Search Refinement", "When a breach occurs between load N and load N+step, converges using binary search to pinpoint exact capacity.");
addBullet("Safe Operating Ceiling", "Computes the maximum safe operational threshold (80% headroom) to prevent queuing runaway in production.");
addBullet("Subcommand CLI Interface", "Exposes dedicated 'loadscope break <url>' command with live step streaming and structured reports.");

// ==================== PAGE 2: QUEUING THEORY & LITTLE'S LAW ====================
addPageHeader("Part 1: The Mathematics of System Saturation");

addSubheading("Little's Law and the Knee of the Latency Curve");
addParagraph(
  "Little's Law is the fundamental law of queuing theory: L = λ * W, where L is the average number of requests in the system (concurrency), λ is throughput (arrival rate), and W is average response time (latency). In a healthy system, as load increases, throughput grows linearly while response time remains nearly constant."
);

addParagraph(
  "However, every system has a physical bottleneck (CPU core count, thread pool size, database connection pool, or lock contention). When arrival rate reaches service capacity μ, queueing delay explodes exponentially according to Kingman's formula:"
);

addCodeBlock(`                     Arrival Rate (λ)
Queueing Delay ≈ ───────────────────────── * Service Time
                  (Service Capacity - λ)

When λ → Capacity:
- Throughput plateaus (saturation)
- Latency diverges to infinity (queue backlog)
- Requests time out or trigger 503 Service Unavailable`);

addSubheading("Universal Scalability Law (Neil Gunther)");
addParagraph(
  "Dr. Neil Gunther's Universal Scalability Law (USL) models concurrency scaling accounting for two real-world phenomena: serialization (Amdahl's law) and cross-talk / coherence penalty (cache invalidation, distributed consensus):"
);

addCodeBlock(`                       N
C(N) = ─────────────────────────────────
        1 + σ(N - 1) + κ * N * (N - 1)

Where:
- N = Concurrency / Parallelism
- σ = Contention coefficient (serialization)
- κ = Coherence coefficient (cross-talk delay)`);

addCallout(
  "Why Coherence Causes Negative Scaling",
  "Beyond the saturation point, adding more concurrency actually reduces total throughput (retrograde scaling). LoadScope's breaking-point finder halts tests immediately upon SLA breach to protect target infrastructure."
);

// ==================== PAGE 3: BINARY SEARCH REFINEMENT ====================
addPageHeader("Part 2: Binary Search Capacity Detection Algorithm");

addSubheading("Two-Phase Capacity Pinpointing");
addParagraph(
  "Running fine-grained load steps across a wide search space is slow. For example, testing every 2 connections from 10 to 200 would require 95 separate test runs (nearly 10 minutes). LoadScope solves this with a two-phase optimization:"
);

addBullet("Phase 1: Coarse Stepped Ramp", "Coarsely strides through the load space (e.g. step = 20) until the first SLA breach is observed at high = N, with last safe load low = N - step.");
addBullet("Phase 2: Binary Search Refinement", "Performs logarithmic search over [low, high] with a stopping tolerance (default: 2), finding the exact breaking threshold in just 3 to 4 iterations.");

addSubheading("Binary Search Convergence Code Structure");
addCodeBlock(`let low = lastSafeLoad;
let high = firstBreachedLoad;

while (high - low > tolerance) {
  const mid = Math.floor((low + high) / 2);
  const summary = await executeStep(options, mid, stepDurationSec);
  const { status } = evaluateThresholds(summary, limits);

  if (status === "BREACH") {
    high = mid;             // Failure occurs at or below mid
    breakingPoint = mid;
  } else {
    low = mid;              // mid is safe, search upper half
  }
}

// Final safe ceiling: 80% rule
const safeCapacity = Math.floor(breakingPoint * 0.8);`);

addSubheading("The 80% Production Headroom Rule");
addParagraph(
  "Production systems must never operate at 100% of their breaking capacity. Traffic is non-stationary and exhibits Poisson burstiness. Operating at 80% capacity ensures that temporary arrival spikes can be absorbed without tipping the system into exponential queue backlog."
);

// ==================== PAGE 4: CLI & PRODUCTION RUNBOOK ====================
addPageHeader("Part 3: CLI Usage & Production Runbook");

addSubheading("Running the Breaking-Point Finder");
addParagraph(
  "The breaking-point finder is accessible via the 'break' (or 'breakpoint') subcommand:"
);

addCodeBlock(`# Basic breaking-point test with default SLA (p95 <= 300ms, errors <= 1%)
loadscope break http://api.internal:8080/v1/orders

# High-precision rate-based capacity search with custom SLA
loadscope break http://api.internal:8080/v1/checkout \\
  --mode rate \\
  --start 100 \\
  --max 1000 \\
  --step 100 \\
  --step-duration 5s \\
  --max-p95 150 \\
  --max-errors 0.5 \\
  --tolerance 5 \\
  --json breakpoint-report.json`);

addSubheading("Interpreting the Output Table");
addCodeBlock(` ┌─────┬─────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┐
 │ Step│ Load        │ Throughput │ p50 (ms) │ p95 (ms) │ p99 (ms) │ Errors   │ Outcome                     │
 ├─────┼─────────────┼────────────┼──────────┼──────────┼──────────┼──────────┼─────────────────────────────┤
 │   1 │ 50 req/s    │   49.8/s   │    8.2   │   14.5   │   22.1   │   0.00%  │ ✅ PASS                     │
 │   2 │ 100 req/s   │   99.4/s   │    9.1   │   18.2   │   28.4   │   0.00%  │ ✅ PASS                     │
 │   3 │ 150 req/s   │  142.1/s   │   45.2   │  182.0   │  290.5   │   0.00%  │ ❌ BREACH (p95 > 150ms)     │
 ├─────┴─────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────────────┤
 │ Refinement Phase (Binary Search Convergence):                                                            │
 ├─────┬─────────────┬────────────┬──────────┬──────────┬──────────┬──────────┬─────────────────────────────┤
 │ • 4 │ 125 req/s   │  124.6/s   │   14.0   │   85.2   │  120.1   │   0.00%  │ ✅ PASS                     │
 │ • 5 │ 137 req/s   │  135.2/s   │   38.4   │  162.8   │  245.0   │   0.00%  │ ❌ BREACH (p95 > 150ms)     │
 └─────┴─────────────┴────────────┴──────────┴──────────┴──────────┴──────────┴─────────────────────────────┘

 🎯 BREAKING POINT DETECTED: 137 req/sec (p95 latency 162.8ms exceeded limit 150ms)
 🛡️ RECOMMENDED SAFE CEILING (80% headroom): 109 req/sec`);

// Add page numbers footer to all pages
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Educational Guide | Phase 4: Breaking-Point Finder — Page ${i + 1} of ${totalPages}`,
    45,
    795,
    { align: "center", width: 505 }
  );
}

doc.end();
