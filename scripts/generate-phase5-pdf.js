import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase5_Complete_Mastery_Guide.pdf");
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
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Phase 5: Baseline Comparison & CI Regression Gate", 60, 93);
doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text("Performance As Code (PaC) • Statistical Tolerance • CI/CD PR Gates • Noise Mitigation", 60, 115);

doc.y = 180;
doc.fontSize(14).fillColor(BRAND_DARK).font("Helvetica-Bold").text("Executive Summary: Shifting Performance Left");
doc.rect(45, doc.y + 2, 505, 1).fill(BRAND);
doc.y += 10;

addParagraph(
  "In modern software engineering, functional bugs are caught by automated unit and integration tests in CI. However, performance regressions (e.g., an unindexed database query, an N+1 ORM query, an accidental O(N^2) loop, or a memory leak) regularly slip into production because load testing is traditionally treated as a manual, post-deployment afterthought."
);

addParagraph(
  "Phase 5 transforms LoadScope into an automated CI Regression Gate. By establishing a committed reference baseline ('loadscope-baseline.json'), CI runners compare the performance of incoming pull requests against the baseline. If latency increases by more than 10% or throughput drops by more than 5%, the gate automatically fails (exit code 1), blocking the regression before it merges."
);

addSubheading("Core Architectural Components in Phase 5");
addBullet("Baseline Storage", "Standard JSON serialization capturing percentiles, throughput, error rates, and git commit SHA.");
addBullet("Regression Gate Engine", "Compares metrics against baseline using directional thresholds (higher is better for RPS, lower is better for latency).");
addBullet("CI Exit Code Contract", "Exits 0 on clean pass or improvement, and exits 1 on regression to directly fail CI PR checks.");
addBullet("GitHub Step Summary", "Automatically renders a clean Markdown comparison table directly inside the GitHub Actions PR review UI.");
addBullet("Offline Comparison CLI", "Provides 'loadscope compare <current.json> <baseline.json>' for offline delta analysis without re-running tests.");

// ==================== PAGE 2: NOISE & TOLERANCE IN CI ====================
addPageHeader("Part 1: The Virtual Machine Noise Problem");

addSubheading("Why Performance Testing in CI is Challenging");
addParagraph(
  "Testing performance in shared cloud CI runners (GitHub Actions, AWS EC2, Google Cloud Build) is notoriously noisy. Because VMs share physical CPUs, hyperthreads, and host memory bus bandwidth with other tenants (noisy neighbors), a test run can fluctuate by 3% to 5% purely due to host hypervisor scheduling."
);

addParagraph(
  "If your regression gate has zero tolerance (e.g. failing on a 0.5% drop in throughput), developers will suffer from flaky CI builds and will eventually disable the gate entirely. LoadScope employs a pragmatic statistical tolerance model:"
);

addCodeBlock(`// Pragmatic CI Regression Tolerances:
maxP95IncreasePct: 10%    // Absorbs VM CPU jitter while catching real algorithmic degradation
maxRpsDropPct:      5%    // Allows minor scheduler variance while gating real capacity loss
maxErrorRate:       1%    // Strict SLA budget for network or HTTP 5xx failures`);

addSubheading("Directional Delta Calculations");
addParagraph(
  "Metrics must be evaluated according to their semantic direction: throughput is 'higher is better', whereas latency and errors are 'lower is better':"
);

addCodeBlock(`// Throughput Delta:
deltaRpsPct = ((currentRps - baselineRps) / baselineRps) * 100;
isRegression = deltaRpsPct < -maxRpsDropPct;

// Latency Delta (p95):
deltaP95Pct = ((currentP95 - baselineP95) / baselineP95) * 100;
isRegression = deltaP95Pct > maxP95IncreasePct;`);

addCallout(
  "Golden Rule of CI Performance Gates",
  "A performance gate must be sensitive to real regressions (e.g., +20% p95 increase from missing index) but immune to hypervisor jitter. A 10% threshold on p95 combined with a 5% threshold on RPS delivers over 99.5% reproducibility in GitHub Actions."
);

// ==================== PAGE 3: GITHUB ACTIONS INTEGRATION ====================
addPageHeader("Part 2: CI Workflow Integration & Step Summaries");

addSubheading("Example GitHub Actions Workflow");
addParagraph(
  "Integrating LoadScope into your pull request pipeline requires just a single step in your '.github/workflows/perf.yml':"
);

addCodeBlock(`name: Performance Regression Gate
on: [pull_request]

jobs:
  perf-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci && npm run build
      - name: Start Mock / App Server
        run: npm run test-server &
      - name: Run LoadScope CI Regression Gate
        run: |
          npx loadscope \\
            --url http://localhost:3000/api \\
            --concurrency 50 \\
            --duration 10s \\
            --baseline loadscope-baseline.json \\
            --max-p95-increase 10 \\
            --max-rps-drop 5`);

addSubheading("GitHub Step Summary Rendering");
addParagraph(
  "When running in GitHub Actions, LoadScope detects '$GITHUB_STEP_SUMMARY' and automatically appends a formatted GitHub-flavored markdown table. Developers can review performance deltas directly on the Pull Request summary page without downloading artifacts or digging through raw console logs."
);

// ==================== PAGE 4: RUNBOOK & BEST PRACTICES ====================
addPageHeader("Part 3: Production Runbook & CLI Commands");

addSubheading("Capturing a New Production Baseline");
addParagraph(
  "When major optimizations are merged or capacity changes occur, capture an updated reference baseline using the '--save-baseline' flag:"
);

addCodeBlock(`# Capture new baseline from a healthy deployment
loadscope -u https://api.staging.internal/v1/orders \\
  --concurrency 100 \\
  --duration 30s \\
  --save-baseline loadscope-baseline.json

# Commit the new baseline to git
git add loadscope-baseline.json
git commit -m "chore(perf): update LoadScope baseline for v2.4.0 release"`);

addSubheading("Offline Delta Comparison");
addParagraph(
  "You can compare any two historical JSON reports offline without executing new HTTP traffic:"
);

addCodeBlock(`# Compare current PR run against production baseline
loadscope compare current-run.json loadscope-baseline.json \\
  --max-p95-increase 10 \\
  --max-rps-drop 5`);

// Add page numbers footer to all pages
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Educational Guide | Phase 5: CI Regression Gate — Page ${i + 1} of ${totalPages}`,
    45,
    795,
    { align: "center", width: 505 }
  );
}

doc.end();
