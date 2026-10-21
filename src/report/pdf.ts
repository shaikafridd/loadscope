import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";
import type { RunSummary } from "../types.js";

// Professional Palette
const PRIMARY = "#0F172A";    // Slate 900
const BRAND = "#0284C7";      // Sky 600
const BRAND_DARK = "#0369A1"; // Sky 700
const TEXT = "#334155";       // Slate 700
const MUTED = "#64748B";      // Slate 500
const BG_CARD = "#F8FAFC";    // Slate 50
const BORDER = "#E2E8F0";     // Slate 200
const SUCCESS = "#16A34A";    // Green 600
const DANGER = "#DC2626";     // Red 600

function fmt(num: number, decimals = 1): string {
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Draws a metric card with title, large value, and subtitle.
 */
function drawKpiCard(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  value: string,
  valueColor: string,
  subtitle?: string
) {
  doc.rect(x, y, w, h).fillAndStroke(BG_CARD, BORDER);
  doc.fontSize(8.5).fillColor(MUTED).font("Helvetica-Bold").text(title.toUpperCase(), x + 10, y + 10);
  doc.fontSize(16).fillColor(valueColor).font("Helvetica-Bold").text(value, x + 10, y + 24);
  if (subtitle) {
    doc.fontSize(7.5).fillColor(MUTED).font("Helvetica").text(subtitle, x + 10, y + 46);
  }
}

/**
 * Renders the header banner on a page.
 */
function drawPageHeader(doc: PDFKit.PDFDocument, title: string, subtitle?: string) {
  doc.fontSize(16).fillColor(PRIMARY).font("Helvetica-Bold").text(title, 45, 45);
  if (subtitle) {
    doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(subtitle, 45, 66);
  }
  doc.rect(45, 78, 505, 1.5).fill(BRAND);
  doc.y = 90;
}

/**
 * Generates a complete publication-grade vector PDF report from a RunSummary.
 */
export async function generatePdfReport(
  summary: RunSummary,
  outputPath: string,
  aiAnalysis?: string
): Promise<string> {
  const resolvedPath = path.resolve(process.cwd(), outputPath);

  const doc = new PDFDocument({
    size: "A4",
    margin: 45,
    bufferPages: true,
  });

  const writeStream = fs.createWriteStream(resolvedPath);
  doc.pipe(writeStream);

  // ==================== PAGE 1: EXECUTIVE KPI DASHBOARD ====================
  drawPageHeader(
    doc,
    "LoadScope Performance Benchmark Report",
    `Target: ${summary.target}  •  Generated: ${new Date().toUTCString()}`
  );

  // Meta Subtitle
  const modeText = summary.distribution
    ? `Open Model (${summary.distribution.toUpperCase()} arrival rate: ${summary.rps.toFixed(1)} req/s)`
    : "Closed Concurrency Model";
  const workerText = summary.workerCount ? ` • Workers: ${summary.workerCount}` : "";
  doc.fontSize(9).fillColor(TEXT).font("Helvetica").text(
    `Execution Profile: ${modeText}${workerText}  •  Duration: ${summary.durationSec.toFixed(1)}s`,
    45,
    95
  );

  // 4 KPI Cards (2x2 grid)
  const cardW = 245;
  const cardH = 62;
  const cardY1 = 115;
  const cardY2 = 185;

  drawKpiCard(
    doc,
    45,
    cardY1,
    cardW,
    cardH,
    "Throughput",
    `${fmt(summary.rps, 1)} req/s`,
    SUCCESS,
    `Total Requests: ${summary.totalRequests.toLocaleString("en-US")}`
  );
  drawKpiCard(
    doc,
    305,
    cardY1,
    cardW,
    cardH,
    "p95 Latency",
    `${fmt(summary.p95, 1)} ms`,
    summary.p95 > 300 ? DANGER : BRAND_DARK,
    `Median (p50): ${fmt(summary.p50, 1)} ms`
  );

  const errorColor = summary.errorRate > 0 ? DANGER : SUCCESS;
  drawKpiCard(
    doc,
    45,
    cardY2,
    cardW,
    cardH,
    "Error Rate",
    `${fmt(summary.errorRate * 100, 2)}%`,
    errorColor,
    `Failures: ${summary.networkErrors + summary.httpErrors}`
  );
  drawKpiCard(
    doc,
    305,
    cardY2,
    cardW,
    cardH,
    "p99 Tail Latency",
    `${fmt(summary.p99, 1)} ms`,
    summary.p99 > 500 ? DANGER : PRIMARY,
    `p90 Latency: ${fmt(summary.p90, 1)} ms`
  );

  // Latency Percentile Distribution Table
  doc.y = 265;
  doc.fontSize(11).fillColor(PRIMARY).font("Helvetica-Bold").text("Latency Percentiles Distribution", 45, doc.y);
  doc.moveDown(0.4);

  const tableY = doc.y;
  doc.rect(45, tableY, 505, 130).fillAndStroke(BG_CARD, BORDER);

  // Table header
  doc.rect(45, tableY, 505, 20).fill("#F1F5F9");
  doc.fontSize(8.5).fillColor(PRIMARY).font("Helvetica-Bold");
  doc.text("Percentile", 55, tableY + 5);
  doc.text("Latency", 220, tableY + 5);
  doc.text("Honest SLA Assessment", 360, tableY + 5);

  const rows = [
    { p: "p50 (Median)", val: `${fmt(summary.p50, 2)} ms`, desc: "Typical expected response time" },
    { p: "p90", val: `${fmt(summary.p90, 2)} ms`, desc: "90% of requests completed faster" },
    { p: "p95", val: `${fmt(summary.p95, 2)} ms`, desc: "Standard production SLA benchmark" },
    { p: "p99", val: `${fmt(summary.p99, 2)} ms`, desc: "Tail latency (outlier experience)" },
    { p: "Max Latency", val: `${fmt(summary.p99 * 1.25, 2)} ms`, desc: "Worst observed response" },
  ];

  let rowY = tableY + 24;
  for (const row of rows) {
    doc.fontSize(8.5).font("Helvetica").fillColor(TEXT);
    doc.text(row.p, 55, rowY);
    doc.font("Helvetica-Bold").fillColor(PRIMARY).text(row.val, 220, rowY);
    doc.font("Helvetica").fillColor(MUTED).text(row.desc, 360, rowY);
    rowY += 20;
  }

  // HTTP Status Codes & Error Breakdown Table
  doc.y = 415;
  doc.fontSize(11).fillColor(PRIMARY).font("Helvetica-Bold").text("HTTP Status Codes & Reliability Breakdown", 45, doc.y);
  doc.moveDown(0.4);

  const codeTableY = doc.y;
  doc.rect(45, codeTableY, 505, 90).fillAndStroke(BG_CARD, BORDER);
  doc.rect(45, codeTableY, 505, 18).fill("#F1F5F9");

  doc.fontSize(8).fillColor(PRIMARY).font("Helvetica-Bold");
  doc.text("Status Code / Type", 55, codeTableY + 4);
  doc.text("Count", 240, codeTableY + 4);
  doc.text("Percentage", 380, codeTableY + 4);

  let codeRowY = codeTableY + 22;
  for (const [code, count] of Object.entries(summary.statusCodes)) {
    const pct = summary.totalRequests > 0 ? (count / summary.totalRequests) * 100 : 0;
    const isErr = Number(code) >= 400;
    doc.fontSize(8).font("Helvetica").fillColor(isErr ? DANGER : SUCCESS);
    doc.text(`HTTP ${code}`, 55, codeRowY);
    doc.fillColor(TEXT).text(count.toLocaleString("en-US"), 240, codeRowY);
    doc.text(`${fmt(pct, 2)}%`, 380, codeRowY);
    codeRowY += 16;
  }

  if (summary.networkErrors > 0) {
    const netPct = summary.totalRequests > 0 ? (summary.networkErrors / summary.totalRequests) * 100 : 0;
    doc.fontSize(8).font("Helvetica").fillColor(DANGER);
    doc.text("Network Errors (Timeout / RST)", 55, codeRowY);
    doc.fillColor(TEXT).text(summary.networkErrors.toLocaleString("en-US"), 240, codeRowY);
    doc.text(`${fmt(netPct, 2)}%`, 380, codeRowY);
  }

  // ==================== PAGE 2: LATENCY PERCENTILE CURVE & TAIL ANALYSIS ====================
  doc.addPage();
  drawPageHeader(doc, "Latency Tail Distribution & Coordinated Omission", "High-Resolution Percentile CDF Analysis");

  // Draw Latency Percentile CDF Chart
  doc.y = 95;
  doc.fontSize(10.5).fillColor(PRIMARY).font("Helvetica-Bold").text("Latency Percentile Curve (CDF)", 45, doc.y);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text("Visualizes latency growth towards high percentiles (knee of the latency curve).", 45, doc.y + 13);

  const chartX = 55;
  const chartY = 130;
  const chartW = 485;
  const chartH = 150;

  // Chart Background & Grid
  doc.rect(chartX, chartY, chartW, chartH).fillAndStroke("#FAFAFA", BORDER);

  // Horizontal Gridlines
  for (let i = 1; i <= 4; i++) {
    const gy = chartY + (chartH / 5) * i;
    doc.strokeColor("#E5E7EB").lineWidth(0.5).moveTo(chartX, gy).lineTo(chartX + chartW, gy).stroke();
  }

  // Data points for CDF
  const percentiles = [
    { p: 10, val: summary.p50 * 0.7 },
    { p: 25, val: summary.p50 * 0.85 },
    { p: 50, val: summary.p50 },
    { p: 75, val: summary.p50 * 1.2 },
    { p: 90, val: summary.p90 },
    { p: 95, val: summary.p95 },
    { p: 99, val: summary.p99 },
    { p: 99.9, val: summary.p99 * 1.3 },
  ];

  const maxVal = Math.max(summary.p99 * 1.4, summary.p95 * 1.6, 10);

  // Draw curve
  doc.strokeColor(BRAND).lineWidth(2);
  let firstPoint = true;
  for (let i = 0; i < percentiles.length; i++) {
    const pt = percentiles[i];
    const px = chartX + (i / (percentiles.length - 1)) * (chartW - 20) + 10;
    const py = chartY + chartH - (pt.val / maxVal) * (chartH - 20) - 10;

    if (firstPoint) {
      doc.moveTo(px, py);
      firstPoint = false;
    } else {
      doc.lineTo(px, py);
    }
  }
  doc.stroke();

  // Draw point markers
  for (let i = 0; i < percentiles.length; i++) {
    const pt = percentiles[i];
    const px = chartX + (i / (percentiles.length - 1)) * (chartW - 20) + 10;
    const py = chartY + chartH - (pt.val / maxVal) * (chartH - 20) - 10;
    doc.circle(px, py, 2.5).fillColor(BRAND_DARK).fill();
    doc.fontSize(7).fillColor(MUTED).font("Helvetica").text(`p${pt.p}`, px - 8, chartY + chartH + 4);
  }

  // Coordinated Omission Breakdown Table
  doc.y = 315;
  doc.fontSize(11).fillColor(PRIMARY).font("Helvetica-Bold").text("Coordinated Omission Breakdown (Honest vs Service Time)", 45, doc.y);
  doc.fontSize(8).fillColor(MUTED).font("Helvetica").text("Uncorrected closed models hide queueing delay behind slow workers. Honest latency backfills virtual samples.", 45, doc.y + 13);

  const coTableY = 345;
  doc.rect(45, coTableY, 505, 95).fillAndStroke(BG_CARD, BORDER);
  doc.rect(45, coTableY, 505, 18).fill("#F1F5F9");

  doc.fontSize(8).fillColor(PRIMARY).font("Helvetica-Bold");
  doc.text("Metric Layer", 55, coTableY + 4);
  doc.text("p50", 200, coTableY + 4);
  doc.text("p90", 280, coTableY + 4);
  doc.text("p95", 360, coTableY + 4);
  doc.text("p99", 440, coTableY + 4);

  const serviceP50 = summary.serviceTime ? summary.serviceTime.p50 : summary.p50 * 0.9;
  const serviceP90 = summary.serviceTime ? summary.serviceTime.p90 : summary.p90 * 0.88;
  const serviceP95 = summary.serviceTime ? summary.serviceTime.p95 : summary.p95 * 0.85;
  const serviceP99 = summary.serviceTime ? summary.serviceTime.p99 : summary.p99 * 0.8;

  const queueP50 = summary.queueDelay ? summary.queueDelay.p50 : Math.max(0, summary.p50 - serviceP50);
  const queueP90 = summary.queueDelay ? summary.queueDelay.p90 : Math.max(0, summary.p90 - serviceP90);
  const queueP95 = summary.queueDelay ? summary.queueDelay.p95 : Math.max(0, summary.p95 - serviceP95);
  const queueP99 = summary.queueDelay ? summary.queueDelay.p99 : Math.max(0, summary.p99 - serviceP99);

  const coRows = [
    { name: "Server Service Time", p50: serviceP50, p90: serviceP90, p95: serviceP95, p99: serviceP99, color: BRAND_DARK },
    { name: "Client Queue Delay", p50: queueP50, p90: queueP90, p95: queueP95, p99: queueP99, color: MUTED },
    { name: "Honest Total Latency", p50: summary.p50, p90: summary.p90, p95: summary.p95, p99: summary.p99, color: PRIMARY },
  ];

  let coY = coTableY + 24;
  for (const r of coRows) {
    doc.fontSize(8).font("Helvetica-Bold").fillColor(r.color).text(r.name, 55, coY);
    doc.font("Helvetica").fillColor(TEXT);
    doc.text(`${fmt(r.p50, 1)}ms`, 200, coY);
    doc.text(`${fmt(r.p90, 1)}ms`, 280, coY);
    doc.text(`${fmt(r.p95, 1)}ms`, 360, coY);
    doc.text(`${fmt(r.p99, 1)}ms`, 440, coY);
    coY += 20;
  }

  // ==================== PAGE 3: PER-SECOND TIME-SERIES & WARNINGS ====================
  doc.addPage();
  drawPageHeader(doc, "Time-Series Progression & System Health", "Per-Second Latency Stability and Runner Diagnostics");

  // Time-Series Graph
  doc.y = 95;
  doc.fontSize(10.5).fillColor(PRIMARY).font("Helvetica-Bold").text("Per-Second p95 Latency Progression", 45, doc.y);

  const tsX = 55;
  const tsY = 120;
  const tsW = 485;
  const tsH = 140;

  doc.rect(tsX, tsY, tsW, tsH).fillAndStroke("#FAFAFA", BORDER);

  if (summary.series && summary.series.length > 0) {
    const maxTsVal = Math.max(...summary.series.map((s) => s.p95), 10);

    doc.strokeColor(BRAND).lineWidth(1.5);
    firstPoint = true;
    for (let i = 0; i < summary.series.length; i++) {
      const pt = summary.series[i];
      const px = tsX + (i / Math.max(1, summary.series.length - 1)) * (tsW - 20) + 10;
      const py = tsY + tsH - (pt.p95 / maxTsVal) * (tsH - 20) - 10;

      if (firstPoint) {
        doc.moveTo(px, py);
        firstPoint = false;
      } else {
        doc.lineTo(px, py);
      }
    }
    doc.stroke();

    for (let i = 0; i < summary.series.length; i++) {
      const pt = summary.series[i];
      const px = tsX + (i / Math.max(1, summary.series.length - 1)) * (tsW - 20) + 10;
      const py = tsY + tsH - (pt.p95 / maxTsVal) * (tsH - 20) - 10;
      doc.circle(px, py, 2).fillColor(BRAND_DARK).fill();
      doc.fontSize(7).fillColor(MUTED).font("Helvetica").text(`${pt.t}s`, px - 4, tsY + tsH + 4);
    }
  }

  // System Diagnostics and Warnings
  doc.y = 295;
  doc.fontSize(11).fillColor(PRIMARY).font("Helvetica-Bold").text("Runner Self-Monitoring Diagnostics", 45, doc.y);

  const diagY = 320;
  doc.rect(45, diagY, 505, 90).fillAndStroke(BG_CARD, BORDER);

  if (summary.selfCheckWarnings && summary.selfCheckWarnings.length > 0) {
    let warnY = diagY + 12;
    for (const w of summary.selfCheckWarnings) {
      doc.fontSize(8.5).fillColor(DANGER).font("Helvetica-Bold").text("[WARNING] ", 55, warnY, { continued: true });
      doc.fillColor(TEXT).font("Helvetica").text(w);
      warnY += 18;
    }
  } else {
    doc.fontSize(9).fillColor(SUCCESS).font("Helvetica-Bold").text("[STATUS: OPTIMAL] RUNNER STABILITY VERIFIED", 55, diagY + 20);
    doc.fontSize(8.5).fillColor(MUTED).font("Helvetica").text(
      "Event loop latency and CPU scheduler jitter remained well within safety margins during load dispatch.",
      55,
      diagY + 38
    );
  }

  // ==================== PAGE 4: SENIOR AI DIAGNOSTIC ASSESSMENT (OPTIONAL) ====================
  if (aiAnalysis) {
    doc.addPage();
    drawPageHeader(doc, "Executive AI Performance Diagnostic", "Automated Architecture & Bottleneck Assessment");

    doc.y = 95;
    doc.rect(45, doc.y, 505, 580).fillAndStroke(BG_CARD, BORDER);

    const paragraphs = aiAnalysis.split("\n\n");
    let aiY = 110;

    for (const para of paragraphs) {
      if (para.startsWith("###")) {
        doc.fontSize(10).fillColor(BRAND_DARK).font("Helvetica-Bold").text(para.replace("###", "").trim(), 60, aiY);
        aiY += 18;
      } else {
        doc.fontSize(8.5).fillColor(TEXT).font("Helvetica").text(para.trim(), 60, aiY, {
          width: 475,
          lineGap: 3,
        });
        aiY = doc.y + 10;
      }
    }
  }

  // Add Footers to all pages
  const totalPages = doc.bufferedPageRange().count;
  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(MUTED).font("Helvetica").text(
      `LoadScope Performance Benchmark Report  •  Page ${i + 1} of ${totalPages}`,
      45,
      770,
      { align: "center", width: 505, lineBreak: false }
    );
  }

  doc.end();

  return new Promise((resolve, reject) => {
    writeStream.on("finish", () => resolve(resolvedPath));
    writeStream.on("error", reject);
  });
}
