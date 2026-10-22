import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase7_Complete_Mastery_Guide.pdf");
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
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Phase 7: Self-Contained Interactive HTML Reports", 60, 93);
doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text("Zero CDN Dependencies • Air-Gapped Ready • Embedded Vector SVG • Browser Export Widgets", 60, 115);

doc.y = 180;
doc.fontSize(14).fillColor(BRAND_DARK).font("Helvetica-Bold").text("Executive Summary: The Portable Performance Artifact");
doc.rect(45, doc.y + 2, 505, 1).fill(BRAND);
doc.y += 10;

addParagraph(
  "Benchmarking results must often be shared across engineering, DevOps, management, and external clients. While terminal tables disappear once the console window closes and raw JSON files require custom parsing tools, interactive HTML reports offer the ideal medium for exploratory analysis and team collaboration."
);

addParagraph(
  "Phase 7 introduces LoadScope's zero-external-dependency HTML report generator (`--html [path]`). By embedding all styling, responsive SVG chart graphics, and raw benchmark datasets directly into a single self-contained HTML file, LoadScope guarantees that the report will render instantly and permanently anywhere—whether opened on an air-gapped laptop, attached to an email, or archived as a CI/CD build artifact."
);

addSubheading("Core Capabilities of Phase 7");
addBullet("Zero External Dependencies", "No external CDN requests, Google Fonts, or third-party JS libraries (D3, Chart.js). Completely functional offline in secure air-gapped networks.");
addBullet("Interactive Latency Percentile CDF", "Vector SVG curve plotting p10 to p99.9 with interactive hover tooltips exposing exact microsecond latencies at each percentile.");
addBullet("Timeline Scrubber", "Per-second p95 latency progression chart with hover inspect capabilities to identify transient performance dips or GC pauses.");
addBullet("Coordinated Omission Layering", "Three-tier interactive table contrasting Server Service Time against Client Queueing Delay and Honest Total Latency.");
addBullet("Client-Side Data Portability", "Embedded JSON and CSV payloads with one-click 'Copy JSON', 'Download JSON', and 'Download CSV' buttons directly in the browser.");

// ==================== PAGE 2: AIR-GAPPED ZERO-DEPENDENCY ARCHITECTURE ====================
addPageHeader("Part 1: The Zero-CDN Architectural Mandate");

addSubheading("The Flaw in Modern HTML Report Generators");
addParagraph(
  "Most web tools generate HTML reports by linking to external CDN scripts (e.g., cdnjs, unpkg, or jsdelivr) for charting libraries like Chart.js or Plotly. In production engineering environments, this architecture causes severe operational failures:"
);

addBullet("Air-Gapped & Restricted VPCs", "Corporate developer laptops, production bastion hosts, and on-premise CI runners often block external internet access. When CDNs fail to load, charts render as blank white boxes.");
addBullet("Bitrot & Version Drift", "CDN links break, change MIME policies, or suffer outages over time. A performance report generated today may fail to render 12 months from now during an audit.");
addBullet("Security Compliance", "Strict corporate policies (SOC2, HIPAA, PCI-DSS) prohibit running unvetted external JavaScript from third-party CDNs inside local browser contexts.");

addSubheading("LoadScope's Self-Contained Solution");
addParagraph(
  "LoadScope bypasses all external libraries. It renders mathematical SVG paths directly from Node.js and embeds lightweight vanilla JavaScript (under 2KB) for interactivity. The entire document is a single standalone `.html` file."
);

addCodeBlock(`// Standalone Vector SVG Architecture (No CDN):
<svg viewBox="0 0 760 240">
  <!-- Dynamic mathematical polyline computed in Node.js -->
  <polyline fill="none" stroke="var(--primary)" stroke-width="3" points="60.0,205.2 160.0,192.4 ..." />
  <!-- Interactive data points with inline hover handlers -->
  <circle class="dot" cx="360.0" cy="152.0" r="4" data-p="p95" data-val="38.60" />
</svg>`);

addCallout(
  "Air-Gapped Reliability Guarantee",
  "A LoadScope HTML report has zero external network calls. You can disconnect Wi-Fi entirely, double-click 'loadscope-report.html', and experience full chart interactivity, hover tooltips, and data exports."
);

// ==================== PAGE 3: INTERACTIVE VISUALIZATIONS & CO ====================
addPageHeader("Part 2: Interactive CDF Curves & Coordinated Omission");

addSubheading("Interactive Percentile CDF Curve");
addParagraph(
  "In web performance, median (p50) latency represents typical user experience, but p95, p99, and p99.9 reflect tail latency where business value is lost. The HTML report provides a high-resolution SVG Cumulative Distribution Function (CDF) chart."
);

addParagraph(
  "Engineers can hover over data points from p10 to p99.9 to display a floating tooltip showing the exact millisecond response time, instantly exposing where the latency 'knee' transitions into exponential degradation."
);

addSubheading("Visualizing Coordinated Omission in HTML");
addParagraph(
  "When a service stalls under load, closed-model benchmarks omit requests that should have arrived, underreporting latency by orders of magnitude. The HTML report visualizes the three-tier Coordinated Omission breakdown:"
);

addCodeBlock(`// Embedded Three-Layer Metric Table:
Layer                     p50        p90        p95        p99
─────────────────────────────────────────────────────────────
Server Service Time     11.2 ms    22.0 ms    33.1 ms    72.5 ms
Client Queueing Delay    1.2 ms     2.8 ms     5.5 ms    16.7 ms
Honest Total Latency    12.4 ms    24.8 ms    38.6 ms    89.2 ms`);

addCallout(
  "Instant Capacity Diagnosis",
  "If Service Time is flat while Queue Delay escalates, downstream workers are fast but incoming concurrency exceeds thread/socket capacity. The bottleneck is the connection pool or queue size, not the application logic."
);

// ==================== PAGE 4: DATA EXPORT & CI ARTIFACT WORKFLOWS ====================
addPageHeader("Part 3: Browser Export Widgets & CI Integration");

addSubheading("Embedded Data Payloads");
addParagraph(
  "Instead of requiring users to manage separate JSON, CSV, and HTML files, LoadScope embeds the raw JSON summary and CSV timeline directly into hidden `<script>` tags inside the HTML document. The UI exposes one-click client-side actions:"
);

addBullet("Copy JSON", "Copies formatted machine-readable benchmark JSON directly to the system clipboard for pasting into tickets or chats.");
addBullet("Download JSON", "Uses Blob/Object URL APIs to trigger a clean file download of the raw data without contacting a server.");
addBullet("Download CSV", "Downloads the per-second time-series and status code breakdown formatted for Excel or Google Sheets.");
addBullet("Print / PDF", "Triggers styled `@media print` rules for clean hard-copy printing or browser vector PDF export.");

addSubheading("CLI Usage Examples");
addCodeBlock(`# Generate self-contained HTML report with default name (loadscope-report.html):
npx loadscope http://localhost:3000/api -c 50 -d 10s --html

# Specify custom HTML output path:
npx loadscope http://localhost:3000/api -c 100 -d 30s --html artifacts/perf-report.html

# Combine with baseline regression gating in CI:
npx loadscope http://localhost:3000/api --baseline base.json --html pr-report.html`);

// ==================== FOOTERS ====================
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Engineering Architecture  •  Phase 7 Mastery Guide  •  Page ${i + 1} of ${totalPages}`,
    45,
    770,
    { align: "center", width: 505, lineBreak: false }
  );
}

doc.end();

writeStream.on("finish", () => {
  console.log(`\n Generated Phase 7 Complete Mastery Guide PDF: ${outputPath}`);
});
