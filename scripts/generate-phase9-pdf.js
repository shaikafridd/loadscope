import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase9_Complete_Mastery_Guide.pdf");
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
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Phase 9: Multi-Step Scenario Scripting & Synthetic User Journeys", 60, 93);
doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text("Declarative YAML/JSON DSL • Context Variable Extraction • Human Think-Time • Waterfall Reporting", 60, 115);

doc.y = 180;
doc.fontSize(14).fillColor(BRAND_DARK).font("Helvetica-Bold").text("Executive Summary: Beyond Isolated HTTP Requests");
doc.rect(45, doc.y + 2, 505, 1).fill(BRAND);
doc.y += 10;

addParagraph(
  "Benchmarking a single endpoint like 'GET /api' provides a valuable baseline for raw throughput. However, real production architectures never experience isolated static traffic. Real users authenticate, acquire session tokens, query databases, browse paginated catalogs, pause to read information (think time), add items to stateful shopping carts, and trigger transaction locks during checkout."
);

addParagraph(
  "Phase 9 elevates LoadScope from an isolated endpoint tool into an enterprise synthetic user journey engine (competing with tools like k6 and Locust). By introducing a declarative YAML and JSON DSL, virtual users execute stateful multi-step workflows, dynamically extracting values from responses (JWTs, user IDs, CSRF tokens) and passing them forward into subsequent steps while simulating realistic human think times."
);

addSubheading("Core Capabilities of Phase 9");
addBullet("Declarative Scenario DSL", "Define complex end-to-end user workflows using intuitive YAML or JSON specifications without requiring heavyweight scripting runtimes.");
addBullet("Session State & Variable Interpolation", "Template engine replaces {{variableName}} in request paths, headers, and JSON bodies using session-isolated virtual user state.");
addBullet("Multi-Source Response Extraction", "Extract variables dynamically from JSON bodies (json:token, json:items[0].id), regular expressions (regex:id=([0-9]+)), or HTTP headers (header:x-csrf-token).");
addBullet("Realistic Human Think-Time", "Simulate realistic user reading pauses (e.g. thinkTime: '150ms') between actions to prevent synthetic barrage distortions.");
addBullet("Step-by-Step Waterfall Breakdown", "Each step is tracked with its own $O(1)$ logarithmic histogram, isolating whether login, search, or checkout is the true bottleneck.");

// ==================== PAGE 2: SCENARIO ARCHITECTURE & VARIABLES ====================
addPageHeader("Part 1: The Scenario DSL & Stateful Context Engine");

addSubheading("Declarative User Journey Specification");
addParagraph(
  "Instead of forcing teams to learn proprietary scripting APIs or embed complex JavaScript sandboxes, LoadScope defines workflows declaratively in YAML or JSON. This ensures scenarios are readable, auditable, and easily maintained in Git repositories alongside application code."
);

addCodeBlock(`// sample-journey.yaml
name: "E-Commerce Checkout Flow"
target: "https://api.example.com"
duration: "30s"
concurrency: 50
steps:
  - name: "1. Authenticate"
    method: "POST"
    path: "/api/login"
    headers: { "Content-Type": "application/json" }
    body: '{"user": "perf_test", "pass": "secret"}'
    extract:
      authToken: "json:token"
      userId: "json:user.id"

  - name: "2. Fetch Catalog"
    method: "GET"
    path: "/api/products?user={{userId}}"
    headers: { "Authorization": "Bearer {{authToken}}" }
    extract:
      selectedItem: "json:products[0].id"
    thinkTime: "100ms"

  - name: "3. Add to Cart"
    method: "POST"
    path: "/api/cart"
    headers: { "Authorization": "Bearer {{authToken}}", "Content-Type": "application/json" }
    body: '{"itemId": "{{selectedItem}}", "qty": 1}'`);

addSubheading("Session Isolation Guarantee");
addParagraph(
  "Each virtual user loop maintains its own private, isolated session context. If Virtual User A extracts 'authToken=AAA' and Virtual User B extracts 'authToken=BBB', their state never bleeds across concurrent threads."
);

addCallout(
  "Safe Failure Propagation",
  "If an authentication step fails (e.g. HTTP 500 or connection timeout), the virtual user marks the journey as failed and immediately terminates the sequence, preventing cascading synthetic errors from polluting downstream APIs."
);

// ==================== PAGE 3: EXTRACTION & THINK-TIME ====================
addPageHeader("Part 2: Dynamic Extractors & Human Think-Time Modeling");

addSubheading("Multi-Source Response Extraction Rules");
addParagraph(
  "Modern APIs return data in various formats. LoadScope's extraction engine supports three primary extraction primitives:"
);

addBullet("JSONPath Traversal ('json:path.to.prop')", "Safely parses JSON responses and navigates nested objects and array indices (e.g. 'json:data.session.token' or 'json:items[0].uuid').");
addBullet("Regular Expression Capture ('regex:pattern')", "Extracts tokens from HTML responses, query strings, or non-JSON payloads using standard capture groups.");
addBullet("HTTP Header Extraction ('header:header-name')", "Extracts security tokens, cookies, or tracking headers case-insensitively (e.g. 'header:set-cookie' or 'header:x-request-id').");

addSubheading("The Role of Think-Time in Load Testing");
addParagraph(
  "Without think-time, 50 concurrent virtual users bombard a server with infinite consecutive loops, generating millions of requests that resemble a Distributed Denial of Service (DDoS) attack rather than human traffic. This causes artificial queue saturation that hides real application bottlenecks."
);

addParagraph(
  "Configuring 'thinkTime: 100ms' or 'thinkTime: 500ms' simulates realistic human reading pauses between clicking buttons, producing natural arrival patterns and realistic database connection pool contention."
);

addCodeBlock(`// Simulating Human Pauses in LoadScope:
steps:
  - name: "View Search Results"
    method: "GET"
    path: "/search?q=laptops"
    thinkTime: "250ms"  // User reviews product list before clicking`);

addCallout(
  "High-Precision Non-Blocking Delays",
  "LoadScope uses high-resolution timers for think-time sleeps, ensuring virtual users yield the Node.js event loop during pauses and maintaining sub-millisecond dispatch accuracy."
);

// ==================== PAGE 4: WATERFALL DIAGNOSTICS & CLI USAGE ====================
addPageHeader("Part 3: Waterfall Performance Diagnostics & CLI Execution");

addSubheading("Step-by-Step Waterfall Terminal Reporting");
addParagraph(
  "When testing a 5-step user journey, knowing that the overall p95 latency is 350ms is not enough. You must know which step caused the degradation. LoadScope tracks separate high-resolution histograms for every step, outputting a clear waterfall breakdown:"
);

addCodeBlock(`╔══════════════════════════════════════════════════════════════════════════════╗
║  🎭 LoadScope Scenario Benchmark Results: E-Commerce Checkout Flow           ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Target:      https://api.example.com                                        ║
║  Duration:    30.0s  │  Concurrency: 50 virtual users                        ║
║  Journeys:    1,420 completed / 1,420 started (100.0%)                       ║
║  Journey RPS: 47.3 journeys/sec  │  Failed: 0                                ║
║  E2E Latency: p50=185.2ms  p90=290.4ms  p95=340.1ms  p99=510.8ms             ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  Step-by-Step Waterfall Performance Breakdown:                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  #   Step Name                Method    Req/s      p50      p95      p99    Err% ║
║  ──────────────────────────────────────────────────────────────────────────  ║
║  1   1. Authenticate          POST       47.3   42.1ms   85.2ms  140.5ms   0.0%  ║
║  2   2. Fetch Catalog         GET        47.3   18.4ms   32.0ms   65.2ms   0.0%  ║
║  3   3. Add to Cart           POST       47.3   24.1ms   45.8ms   92.0ms   0.0%  ║
║  4   4. Complete Checkout     POST       47.3  100.2ms  175.4ms  310.0ms   0.0%  ║
╚══════════════════════════════════════════════════════════════════════════════╝`);

addSubheading("CLI Usage Commands");
addCodeBlock(`# Execute scenario using defaults from YAML:
npx loadscope scenario journey.yaml

# Override concurrency and duration from CLI:
npx loadscope scenario journey.yaml -c 100 -d 1m

# Generate visual HTML and vector PDF reports for scenario run:
npx loadscope scenario journey.yaml --html scenario.html --pdf scenario.pdf`);

// ==================== FOOTERS ====================
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Engineering Architecture  •  Phase 9 Mastery Guide  •  Page ${i + 1} of ${totalPages}`,
    45,
    770,
    { align: "center", width: 505, lineBreak: false }
  );
}

doc.end();

writeStream.on("finish", () => {
  console.log(`\n Generated Phase 9 Complete Mastery Guide PDF: ${outputPath}`);
});
