import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const outputPath = path.resolve("LoadScope_Phase8_Complete_Mastery_Guide.pdf");
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
doc.fontSize(13).fillColor(BRAND).font("Helvetica").text("Phase 8: Open-Source Release Engineering & Packaging Hygiene", 60, 93);
doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text("Distribution Tarball Audit • Semantic Versioning • Architecture Documentation • v0.1.0 Release", 60, 115);

doc.y = 180;
doc.fontSize(14).fillColor(BRAND_DARK).font("Helvetica-Bold").text("Executive Summary: The Bridge from Code to Public Software");
doc.rect(45, doc.y + 2, 505, 1).fill(BRAND);
doc.y += 10;

addParagraph(
  "Building high-performance algorithms, multi-threaded schedulers, and vector reporting engines is only half of the software engineering discipline. The remaining half is distribution hygiene: packaging the tool so that any developer on earth can execute 'npx loadscope' with zero friction, zero bloat, and total predictability across operating systems."
);

addParagraph(
  "Phase 8 marks the culmination of LoadScope's development lifecycle. It institutes rigorous npm packaging whitelists, comprehensive architectural documentation (Mermaid sequence and state graphs), feature comparison matrices, and release standards (Conventional Commits, Keep a Changelog, and MIT licensing)."
);

addSubheading("Core Milestones of Phase 8");
addBullet("Package Manifest Audit", "Configuring strict 'files' whitelists to ensure only compiled bundles ('dist/'), README, and LICENSE enter the public distribution tarball.");
addBullet("Executable Shebang Contract", "Validating '#!/usr/bin/env node' and binary symlinks ('bin: { loadscope: dist/cli.js }') for immediate global CLI execution.");
addBullet("Production Documentation", "Comprehensive README.md featuring architectural diagrams, comparative matrices against autocannon/wrk/k6, and full flag references.");
addBullet("Community Governance", "Instituting CONTRIBUTING.md guidelines for test execution, PR branch etiquette, and virtualization noise mitigation.");
addBullet("Lifecycle Retrospective", "Consolidating all 8 milestone phases from single-core memory histograms to AI-assisted vector PDF reports.");

// ==================== PAGE 2: PACKAGING HYGIENE & TARBALL AUDIT ====================
addPageHeader("Part 1: NPM Packaging Hygiene & Distribution Audits");

addSubheading("Why Distribution Hygiene Matters");
addParagraph(
  "A common failure among Node.js open-source packages is leaking temporary test files, development scripts, uncompiled TypeScript sources, or heavy binary assets into the npm registry tarball. This wastes bandwidth, triggers corporate security scanner flags, and bloats CI install times across thousands of downstream pipelines."
);

addSubheading("The Strict 'files' Whitelist");
addParagraph(
  "Instead of relying on an easily broken '.npmignore' blacklist, LoadScope explicitly whitelists only the essential runtime distribution files in package.json:"
);

addCodeBlock(`// package.json Distribution Whitelist:
"files": [
  "dist",       // Pre-bundled, tree-shaken ESM and TypeScript definitions
  "README.md",  // Essential registry documentation
  "LICENSE"     // Open-source legal compliance
]`);

addSubheading("Verifying with 'npm pack --dry-run'");
addParagraph(
  "Before publishing any version, the distribution package must be validated using 'npm pack --dry-run'. This command simulates registry packaging without publishing, outputting the exact file list, total uncompressed size, and tarball byte count:"
);

addCodeBlock(`// npm pack --dry-run Validation Output:
npm notice filename: loadscope-0.1.0.tgz
npm notice package size: ~75 kB
npm notice unpacked size: ~280 kB
npm notice total files: 12 (dist/*.js, dist/*.d.ts, README.md, LICENSE)`);

addCallout(
  "Zero Binary Leakage",
  "Because *.pdf is strictly enforced in .gitignore and omitted from package.json 'files', generated guide PDFs and test reports are never leaked into Git revisions or npm tarballs."
);

// ==================== PAGE 3: ARCHITECTURE & RELEASE DOCUMENTATION ====================
addPageHeader("Part 2: Visual Architecture & Release Governance");

addSubheading("Documentation as Code: Mermaid Diagrams");
addParagraph(
  "Engineers evaluate tools through visual architecture before reading code. Phase 8 embeds three distinct Mermaid diagrams directly inside the GitHub README:"
);

addBullet("Worker Pool Architecture", "Visualizes the non-blocking worker thread dispatch model, undici connection pools, and real-time 4Hz inter-process tick messaging.");
addBullet("Coordinated Omission Sequence", "Contrasts the flawed closed concurrency model against LoadScope's virtual request schedule backfilling.");
addBullet("Bisection Search State Machine", "Diagrams the stepped load ramp transitioning into binary search refinement upon SLA breach.");

addSubheading("Release Notes & Semantic Versioning");
addParagraph(
  "LoadScope adheres strictly to Semantic Versioning (SemVer 2.0.0) and the Keep a Changelog standard. The v0.1.0 release establishes the public API baseline for both the CLI and TypeScript programmatic SDK:"
);

addCodeBlock(`// Programmatic SDK Contract:
import { run, runBreakingPoint, generatePdfReport, generateHtmlReport } from "loadscope";

// Execute load test with full type safety:
const summary = await run({ url: "https://api.example.com", concurrency: 50, duration: 10 });
await generatePdfReport(summary, "report.pdf");
await generateHtmlReport(summary, "report.html");`);

addCallout(
  "Open Source Governance",
  "A robust open-source project requires clear rules. CONTRIBUTING.md ensures that external contributors understand our sequential test runner policies, virtualization jitter tolerances, and commit conventions."
);

// ==================== PAGE 4: THE 8-PHASE RETROSPECTIVE ====================
addPageHeader("Part 3: Complete Project Architectural Retrospective");

addSubheading("Summary of Achievements (Phases 0 through 8)");
addParagraph(
  "Across 8 rigorous engineering phases, LoadScope evolved from an initial concept into an enterprise-grade performance testing ecosystem:"
);

addBullet("Phase 0", "Fastify mock server with simulated delay, stall, error, and connection reset endpoints.");
addBullet("Phase 1", "Single-core engine with custom 260-bucket log histogram ($O(1)$ memory) and terminal tables.");
addBullet("Phase 2", "Multi-core worker threads scaling across physical CPU cores + 4Hz live terminal dashboard.");
addBullet("Phase 3", "Open arrival scheduling (Uniform/Poisson), Gil Tene Coordinated Omission correction, and TTFB tracking.");
addBullet("Phase 4", "Automated breaking-point finder with stepped load ramp and binary search bisection.");
addBullet("Phase 5", "CI/CD performance regression gate with baseline persistence, directional tolerances, and GitHub PR step summaries.");
addBullet("Phase 6", "Zero-browser vector PDF generator (<100ms render via PDFKit) and AI Performance Diagnostic Engine.");
addBullet("Phase 7", "Self-contained interactive HTML reports with embedded SVG charts and zero external CDN calls.");
addBullet("Phase 8", "Open-source packaging, npm pack verification, architecture diagrams, and v0.1.0 release.");

// ==================== FOOTERS ====================
const totalPages = doc.bufferedPageRange().count;
for (let i = 0; i < totalPages; i++) {
  doc.switchToPage(i);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
    `LoadScope Engineering Architecture  •  Phase 8 Mastery Guide  •  Page ${i + 1} of ${totalPages}`,
    45,
    770,
    { align: "center", width: 505, lineBreak: false }
  );
}

doc.end();

writeStream.on("finish", () => {
  console.log(`\n Generated Phase 8 Complete Mastery Guide PDF: ${outputPath}`);
});
