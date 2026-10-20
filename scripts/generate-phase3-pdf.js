import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase3_Complete_Mastery_Guide.pdf");
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
    paragraphGap: 4,
  });
}

function addCodeBlock(code) {
  const codeLines = code.split("\n");
  const blockHeight = codeLines.length * 10.5 + 14;

  if (doc.y + blockHeight > 750) {
    doc.addPage();
  }

  const y = doc.y + 3;
  doc.rect(45, y, 505, blockHeight).fillAndStroke(BG_CODE, BORDER_CODE);
  doc.fontSize(7.8).fillColor("#0F172A").font("Courier");
  
  let lineY = y + 7;
  for (const line of codeLines) {
    doc.text(line, 55, lineY, { width: 485 });
    lineY += 10.5;
  }
  doc.y = y + blockHeight + 6;
}

function addExplanation(items) {
  for (const [key, desc] of items) {
    if (doc.y + 24 > 760) {
      doc.addPage();
    }
    const currentY = doc.y;
    doc.fontSize(8.5).fillColor(BRAND_DARK).font("Helvetica-Bold").text("• " + key + ": ", 52, currentY, { continued: true });
    doc.font("Helvetica").fillColor(TEXT).text(desc, { lineGap: 2 });
    doc.moveDown(0.25);
  }
}

function addCallout(title, text) {
  const textHeight = 44;
  if (doc.y + textHeight > 750) {
    doc.addPage();
  }
  const y = doc.y + 4;
  doc.rect(45, y, 505, textHeight).fillAndStroke(CALLOUT_BG, CALLOUT_BORDER);
  doc.fontSize(9).fillColor("#166534").font("Helvetica-Bold").text(`💡 ${title}`, 55, y + 6);
  doc.fontSize(8).fillColor("#14532D").font("Helvetica").text(text, 55, y + 18, { width: 485, lineGap: 2 });
  doc.y = y + textHeight + 6;
}

// ==================== COVER / PAGE 1 ====================
doc.rect(45, 45, 505, 10).fill(BRAND);
doc.moveDown(1.5);
doc.fontSize(24).fillColor(PRIMARY).font("Helvetica-Bold").text("LoadScope: Phase 3 Deep-Dive");
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Honest Latency, Poisson Scheduling & Coordinated Omission Mastery");
doc.moveDown(0.4);
doc.fontSize(9).fillColor(MUTED).font("Helvetica").text("An exhaustive, line-by-line engineering breakdown of Phase 3 implementation.");
doc.moveDown(0.8);

doc.fontSize(14).fillColor(PRIMARY).font("Helvetica-Bold").text("What Was Built in Phase 3?");
addParagraph(
  "Phase 3 solves the single most critical flaw in modern load testing: Coordinated Omission. In conventional closed-loop tools (ApacheBench, wrk, standard k6), when a server stalls, the load generator stalls too, omitting the requests that real users would have attempted. Phase 3 implements open arrival scheduling (Uniform and Poisson processes), dual-latency tracking (Service Time vs Honest Latency), TTFB measurement, and Gil Tene's synthetic backfill correction."
);

addCallout(
  "Phase 3 Definition of Done (Passed)",
  "Phase 3 is complete when: (1) Open-model scheduler drives fixed arrival rates independent of server stalls, (2) Poisson stochastic inter-arrival times are verified, (3) Dual-latency tracking exposes client queueing delays side-by-side with server service times, and (4) All automated unit/integration tests pass."
);

addSubheading("Files Built in Phase 3");
addParagraph("Every component built in Phase 3 fulfills a specific mathematical and architectural role:");
addExplanation([
  ["src/core/scheduler.ts", "High-precision microsecond arrival scheduler supporting Uniform and Poisson stochastic processes."],
  ["src/stats/co-corrector.ts", "Gil Tene's Coordinated Omission correction algorithm for synthetic virtual sample backfilling."],
  ["src/core/open-model.ts", "Dual-histogram open runner tracking response time, server service time, and TTFB."],
  ["src/report/terminal.ts", "Expanded 4-column comparison table showing Service Time, Queue Delay, and Honest Latency."],
  ["test/co-corrector.test.ts", "Unit tests validating virtual sample generation and tail latency penalization."],
  ["test/open-model.test.ts", "Integration tests verifying Poisson scheduling and dual-latency tracking."]
]);

// ==================== PAGE 2: COORDINATED OMISSION THEORY ====================
addPageHeader("1. The Coordinated Omission Trap");
addParagraph(
  "Coordinated Omission (coined by Gil Tene) occurs whenever the timing of request dispatches is coordinated with or delayed by response completions. Consider a server handling 100 req/s that experiences a 10-second GC freeze:"
);

addExplanation([
  ["Closed-Loop Measurement (Flawed)", "A closed-loop tool with 1 worker sends 1 request, waits 10s, and logs 1 slow sample. The 999 requests that real users attempted during those 10s are omitted. p99 looks good precisely when the system failed!"],
  ["Open-Model Measurement (Honest)", "An open-model tool schedules requests according to an independent arrival clock. When the server freezes, incoming requests queue up. The 100th request waits 9.0s, the 500th waits 5.0s, and the 999th waits 0.1s."],
  ["Dual-Latency Tracking", "LoadScope measures BOTH: Service Time (completion - dispatch) and Honest Response Time (completion - scheduled arrival). The difference is the Queue Delay."]
]);

addCodeBlock(`// Latency measured from INTENDED arrival time (src/core/open-model.ts)
const targetArrivalNs = scheduler.nextArrivalNs();
await scheduler.waitUntil(targetArrivalNs);

const dispatchNs = process.hrtime.bigint();
const response = await pool.request(...);
const headersNs = process.hrtime.bigint(); // TTFB = headersNs - dispatchNs

await response.body.dump({ limit: 10 * 1024 * 1024 });
const completionNs = process.hrtime.bigint();

const serviceUs = Number(completionNs - dispatchNs) / 1000;
const honestResponseUs = Number(completionNs - targetArrivalNs) / 1000; // Reveals Queue Delay!`);

// ==================== PAGE 3: POISSON PROCESS & QUEUEING THEORY ====================
addPageHeader("2. Poisson Arrival Process & Queueing Theory");
addParagraph(
  "In real production traffic, users do not arrive like metronomes at exactly 10.000ms intervals. User requests arrive independently at random intervals modeled by a Poisson process (exponential inter-arrival distribution)."
);

addCodeBlock(`// Stochastic Poisson Inter-Arrival Times (src/core/scheduler.ts)
// For a Poisson process with rate lambda, the inter-arrival time Delta_t follows:
// Delta_t = -ln(U) / lambda, where U ~ Uniform(0, 1]
const u = Math.max(1e-10, 1 - Math.random());
const intervalSec = -Math.log(u) / this.rate;
const intervalNs = BigInt(Math.floor(intervalSec * 1_000_000_000));
this.currentScheduledNs += intervalNs;`);

addExplanation([
  ["Queueing Theory (M/M/1)", "Under a Poisson process, traffic exhibits micro-bursts where several requests arrive in close succession. This tests whether the server's connection queues and thread pools can handle burstiness."],
  ["Memoryless Property", "The exponential distribution is memoryless: P(T > s + t | T > s) = P(T > t). Past arrivals give no information about future arrival times, perfectly mirroring uncoordinated human users."],
  ["Little's Law Validation", "Little's Law states L = lambda * W (Average In-Flight Requests = Arrival Rate * Average Latency). LoadScope's open model accurately respects Little's Law under variable load."]
]);

// ==================== PAGE 4: GIL TENE CORRECTION ALGORITHM ====================
addPageHeader("3. Gil Tene's Synthetic Backfill Algorithm");
addParagraph(
  "When running in closed-model mode or when schedule slips occur, LoadScope applies Gil Tene's synthetic backfill correction (from wrk2 and HdrHistogram) to reconstruct missing samples."
);

addCodeBlock(`// Virtual sample backfilling (src/stats/co-corrector.ts)
export function recordWithCorrection(
  histogram: Histogram,
  latencyUs: number,
  expectedIntervalUs: number
): number {
  histogram.record(latencyUs);
  if (expectedIntervalUs <= 0 || latencyUs <= expectedIntervalUs) {
    return 1;
  }

  let added = 1;
  let virtualLatencyUs = latencyUs - expectedIntervalUs;

  // Synthesize requests that were delayed behind the stall
  while (virtualLatencyUs > 0) {
    histogram.record(virtualLatencyUs);
    added++;
    virtualLatencyUs -= expectedIntervalUs;
  }

  return added;
}`);

addExplanation([
  ["Linear Virtual Backfill", "If a request took 50ms with an expected interval of 10ms, 4 virtual requests were delayed behind it at 40ms, 30ms, 20ms, and 10ms."],
  ["Honest Tail Latency", "By backfilling the omitted samples, the p95 and p99 accurately represent the degraded experience felt by real users during system stalls."],
  ["Time-To-First-Byte (TTFB)", "By tracking headers resolution timestamp separately from body completion, LoadScope isolates backend processing latency from network serialization transfer time."]
]);

// Add footer page numbers
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Educational Guide | Phase 3 (Honest Latency & Coordinated Omission) — Page ${i + 1} of ${totalPages}`,
    45,
    795,
    { align: "center", width: 505 }
  );
}

doc.end();

writeStream.on("finish", () => {
  console.log(`[PDF Generator] Successfully written PDF to ${outputPath}`);
});
