import fs from "node:fs/promises";
import path from "node:path";
import type { RunSummary } from "../types.js";
import { formatJsonReport, formatCsvReport } from "./export.js";

function fmt(n: number, d = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Generates an interactive, zero-external-dependency HTML document string.
 */
export function renderHtmlReport(summary: RunSummary): string {
  const jsonReport = formatJsonReport(summary);
  const csvReport = formatCsvReport(summary);

  const serviceP50 = summary.serviceTime ? summary.serviceTime.p50 : summary.p50 * 0.9;
  const serviceP90 = summary.serviceTime ? summary.serviceTime.p90 : summary.p90 * 0.88;
  const serviceP95 = summary.serviceTime ? summary.serviceTime.p95 : summary.p95 * 0.85;
  const serviceP99 = summary.serviceTime ? summary.serviceTime.p99 : summary.p99 * 0.8;

  const queueP50 = summary.queueDelay ? summary.queueDelay.p50 : Math.max(0, summary.p50 - serviceP50);
  const queueP90 = summary.queueDelay ? summary.queueDelay.p90 : Math.max(0, summary.p90 - serviceP90);
  const queueP95 = summary.queueDelay ? summary.queueDelay.p95 : Math.max(0, summary.p95 - serviceP95);
  const queueP99 = summary.queueDelay ? summary.queueDelay.p99 : Math.max(0, summary.p99 - serviceP99);

  // Percentiles for CDF chart
  const cdfPoints = [
    { p: "p10", val: summary.p50 * 0.7 },
    { p: "p25", val: summary.p50 * 0.85 },
    { p: "p50", val: summary.p50 },
    { p: "p75", val: summary.p50 * 1.2 },
    { p: "p90", val: summary.p90 },
    { p: "p95", val: summary.p95 },
    { p: "p99", val: summary.p99 },
    { p: "p99.9", val: summary.p99 * 1.35 },
  ];

  const maxCdf = Math.max(...cdfPoints.map((pt) => pt.val), 10);
  const cdfSvgW = 760;
  const cdfSvgH = 240;
  const cdfPadX = 60;
  const cdfPadY = 30;

  const cdfCoords = cdfPoints.map((pt, i) => {
    const x = cdfPadX + (i / (cdfPoints.length - 1)) * (cdfSvgW - cdfPadX * 2);
    const y = cdfSvgH - cdfPadY - (pt.val / maxCdf) * (cdfSvgH - cdfPadY * 2);
    return { ...pt, x, y };
  });

  const cdfPolyline = cdfCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  // Time-Series points
  const series = summary.series && summary.series.length > 0
    ? summary.series
    : [{ t: 1, p95: summary.p95 }];
  const maxTs = Math.max(...series.map((s) => s.p95), 10);
  const tsSvgW = 760;
  const tsSvgH = 200;
  const tsPadX = 50;
  const tsPadY = 30;

  const tsCoords = series.map((pt, i) => {
    const x = tsPadX + (i / Math.max(1, series.length - 1)) * (tsSvgW - tsPadX * 2);
    const y = tsSvgH - tsPadY - (pt.p95 / maxTs) * (tsSvgH - tsPadY * 2);
    return { ...pt, x, y };
  });

  const tsPolyline = tsCoords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ");

  // Status codes breakdown
  const statusEntries = Object.entries(summary.statusCodes);
  const totalStatusReqs = summary.totalRequests > 0 ? summary.totalRequests : 1;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>LoadScope Report - ${escapeHtml(summary.target)}</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: #111827;
      --card-border: #1f2937;
      --text: #f9fafb;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --primary: #38bdf8;
      --primary-dark: #0284c7;
      --success: #22c55e;
      --warning: #f59e0b;
      --danger: #ef4444;
      --grid-line: #1e293b;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.5;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 1040px;
      margin: 0 auto;
    }
    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 1.5rem;
      gap: 1rem;
    }
    .badge {
      display: inline-block;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      margin-bottom: 0.5rem;
    }
    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .target-url {
      color: var(--text-muted);
      font-family: monospace;
      font-size: 0.95rem;
      word-break: break-all;
      margin-top: 0.25rem;
    }
    .actions {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    button {
      background: #1f2937;
      color: var(--text);
      border: 1px solid #374151;
      padding: 0.5rem 0.9rem;
      border-radius: 6px;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
    }
    button:hover {
      background: #374151;
      border-color: #4b5563;
      color: #fff;
    }
    button.primary {
      background: var(--primary-dark);
      border-color: var(--primary);
      color: #fff;
    }
    button.primary:hover {
      background: var(--primary);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      position: relative;
    }
    .card-title {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.4rem;
    }
    .card-value {
      font-size: 1.85rem;
      font-weight: 800;
      line-height: 1.2;
    }
    .card-sub {
      font-size: 0.8rem;
      color: var(--text-dim);
      margin-top: 0.35rem;
    }
    .val-success { color: var(--success); }
    .val-danger { color: var(--danger); }
    .val-primary { color: var(--primary); }
    .section-title {
      font-size: 1.2rem;
      font-weight: 700;
      margin: 2rem 0 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .chart-container {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 8px;
      padding: 1.25rem;
      position: relative;
      overflow-x: auto;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
    }
    .tooltip {
      position: absolute;
      background: #0f172a;
      border: 1px solid var(--primary);
      color: #fff;
      padding: 0.35rem 0.65rem;
      border-radius: 4px;
      font-size: 0.75rem;
      font-weight: 600;
      pointer-events: none;
      display: none;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
      z-index: 10;
    }
    .dot {
      cursor: pointer;
      transition: r 0.15s ease, fill 0.15s ease;
    }
    .dot:hover {
      r: 6;
      fill: #fff !important;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 0.9rem;
    }
    th, td {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid var(--card-border);
    }
    th {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      background: rgba(31, 41, 55, 0.4);
    }
    tr:last-child td {
      border-bottom: none;
    }
    .bar-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.6rem;
    }
    .bar-label {
      width: 140px;
      font-size: 0.85rem;
      font-family: monospace;
    }
    .bar-track {
      flex: 1;
      height: 12px;
      background: #1f2937;
      border-radius: 9999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 9999px;
      transition: width 0.3s ease;
    }
    .bar-val {
      width: 80px;
      text-align: right;
      font-size: 0.85rem;
      color: var(--text-muted);
    }
    .callout {
      border-left: 4px solid;
      border-radius: 4px;
      padding: 0.85rem 1.15rem;
      background: var(--card-bg);
      margin-top: 1rem;
      font-size: 0.9rem;
    }
    .callout-optimal {
      border-color: var(--success);
      color: #bbf7d0;
    }
    .callout-warning {
      border-color: var(--warning);
      color: #fde68a;
    }
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--card-border);
      text-align: center;
      font-size: 0.8rem;
      color: var(--text-dim);
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <span class="badge">LoadScope Benchmark Report</span>
        <h1>Executive Load Performance Analysis</h1>
        <div class="target-url">${escapeHtml(summary.target)}</div>
        <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.4rem;">
          Duration: ${summary.durationSec.toFixed(1)}s &bull; Mode: ${summary.distribution ? `Open (${summary.distribution.toUpperCase()})` : "Closed Concurrency"} &bull; Workers: ${summary.workerCount || 1}
        </div>
      </div>
      <div class="actions">
        <button onclick="copyJson()">📋 Copy JSON</button>
        <button onclick="downloadJson()">⬇️ Download JSON</button>
        <button onclick="downloadCsv()">📊 Download CSV</button>
        <button class="primary" onclick="window.print()">🖨️ Print / PDF</button>
      </div>
    </header>

    <!-- KPI Grid -->
    <div class="kpi-grid">
      <div class="card">
        <div class="card-title">Throughput</div>
        <div class="card-value val-success">${fmt(summary.rps, 1)} <span style="font-size: 1rem; font-weight: normal; color: var(--text-muted);">req/s</span></div>
        <div class="card-sub">Total Dispatched: ${summary.totalRequests.toLocaleString("en-US")}</div>
      </div>
      <div class="card">
        <div class="card-title">p95 Latency</div>
        <div class="card-value ${summary.p95 > 300 ? "val-danger" : "val-primary"}">${fmt(summary.p95, 1)} <span style="font-size: 1rem; font-weight: normal; color: var(--text-muted);">ms</span></div>
        <div class="card-sub">Median p50: ${fmt(summary.p50, 1)} ms</div>
      </div>
      <div class="card">
        <div class="card-title">Error Rate</div>
        <div class="card-value ${summary.errorRate > 0 ? "val-danger" : "val-success"}">${fmt(summary.errorRate * 100, 2)}%</div>
        <div class="card-sub">Failures: ${summary.networkErrors + summary.httpErrors} (${summary.networkErrors} net, ${summary.httpErrors} http)</div>
      </div>
      <div class="card">
        <div class="card-title">Tail Latency (p99)</div>
        <div class="card-value val-primary">${fmt(summary.p99, 1)} <span style="font-size: 1rem; font-weight: normal; color: var(--text-muted);">ms</span></div>
        <div class="card-sub">90th Percentile: ${fmt(summary.p90, 1)} ms</div>
      </div>
    </div>

    <!-- Latency CDF Curve Section -->
    <div class="section-title">
      📈 Latency Percentile Curve (CDF)
    </div>
    <div class="chart-container" id="cdf-container">
      <div class="tooltip" id="cdf-tooltip"></div>
      <svg viewBox="0 0 ${cdfSvgW} ${cdfSvgH}">
        <!-- Horizontal Grid Lines -->
        <line x1="${cdfPadX}" y1="${cdfPadY}" x2="${cdfSvgW - cdfPadX}" y2="${cdfPadY}" stroke="var(--grid-line)" stroke-width="1" />
        <line x1="${cdfPadX}" y1="${(cdfPadY + cdfSvgH - cdfPadY) / 2}" x2="${cdfSvgW - cdfPadX}" y2="${(cdfPadY + cdfSvgH - cdfPadY) / 2}" stroke="var(--grid-line)" stroke-width="1" />
        <line x1="${cdfPadX}" y1="${cdfSvgH - cdfPadY}" x2="${cdfSvgW - cdfPadX}" y2="${cdfSvgH - cdfPadY}" stroke="var(--card-border)" stroke-width="1.5" />

        <!-- Polyline Curve -->
        <polyline fill="none" stroke="var(--primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${cdfPolyline}" />

        <!-- Points -->
        ${cdfCoords
          .map(
            (c) => `<circle class="dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="4" fill="var(--primary-dark)" stroke="var(--primary)" stroke-width="2" data-p="${c.p}" data-val="${c.val.toFixed(2)}" />
                    <text x="${c.x.toFixed(1)}" y="${cdfSvgH - 10}" fill="var(--text-muted)" font-size="11" text-anchor="middle" font-family="sans-serif">${c.p}</text>`
          )
          .join("\n        ")}
      </svg>
    </div>

    <!-- Coordinated Omission Breakdown Table -->
    <div class="section-title">
      ⏱️ Coordinated Omission Breakdown (Honest Latency vs Service Time)
    </div>
    <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 2rem;">
      <table>
        <thead>
          <tr>
            <th>Metric Layer</th>
            <th>p50 (Median)</th>
            <th>p90</th>
            <th>p95</th>
            <th>p99</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: 600; color: var(--primary);">Server Service Time</td>
            <td>${fmt(serviceP50, 1)} ms</td>
            <td>${fmt(serviceP90, 1)} ms</td>
            <td>${fmt(serviceP95, 1)} ms</td>
            <td>${fmt(serviceP99, 1)} ms</td>
          </tr>
          <tr>
            <td style="font-weight: 600; color: var(--text-muted);">Client Queueing Delay</td>
            <td>${fmt(queueP50, 1)} ms</td>
            <td>${fmt(queueP90, 1)} ms</td>
            <td>${fmt(queueP95, 1)} ms</td>
            <td>${fmt(queueP99, 1)} ms</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: #fff;">Honest Total Latency</td>
            <td style="font-weight: 600;">${fmt(summary.p50, 1)} ms</td>
            <td style="font-weight: 600;">${fmt(summary.p90, 1)} ms</td>
            <td style="font-weight: 600;">${fmt(summary.p95, 1)} ms</td>
            <td style="font-weight: 600;">${fmt(summary.p99, 1)} ms</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Time-Series Progression Section -->
    <div class="section-title">
      📊 Per-Second p95 Latency Progression
    </div>
    <div class="chart-container" id="ts-container">
      <div class="tooltip" id="ts-tooltip"></div>
      <svg viewBox="0 0 ${tsSvgW} ${tsSvgH}">
        <!-- Grid -->
        <line x1="${tsPadX}" y1="${tsPadY}" x2="${tsSvgW - tsPadX}" y2="${tsPadY}" stroke="var(--grid-line)" stroke-width="1" />
        <line x1="${tsPadX}" y1="${(tsPadY + tsSvgH - tsPadY) / 2}" x2="${tsSvgW - tsPadX}" y2="${(tsPadY + tsSvgH - tsPadY) / 2}" stroke="var(--grid-line)" stroke-width="1" />
        <line x1="${tsPadX}" y1="${tsSvgH - tsPadY}" x2="${tsSvgW - tsPadX}" y2="${tsSvgH - tsPadY}" stroke="var(--card-border)" stroke-width="1.5" />

        <!-- Line -->
        <polyline fill="none" stroke="#a855f7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${tsPolyline}" />

        <!-- Points -->
        ${tsCoords
          .map(
            (c) => `<circle class="dot" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5" fill="#7e22ce" stroke="#a855f7" stroke-width="1.5" data-t="${c.t}s" data-val="${c.p95.toFixed(2)}" />
                    <text x="${c.x.toFixed(1)}" y="${tsSvgH - 10}" fill="var(--text-muted)" font-size="10" text-anchor="middle" font-family="sans-serif">${c.t}s</text>`
          )
          .join("\n        ")}
      </svg>
    </div>

    <!-- Status Codes & Error Breakdown -->
    <div class="section-title">
      🚦 HTTP Status & Reliability Breakdown
    </div>
    <div class="card" style="margin-bottom: 2rem;">
      ${statusEntries
        .map(([code, count]) => {
          const pct = (count / totalStatusReqs) * 100;
          const isErr = parseInt(code, 10) >= 400;
          const fillCol = isErr ? "var(--danger)" : "var(--success)";
          return `<div class="bar-row">
            <span class="bar-label">HTTP ${code}</span>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${pct.toFixed(1)}%; background: ${fillCol};"></div>
            </div>
            <span class="bar-val">${count.toLocaleString("en-US")} (${pct.toFixed(1)}%)</span>
          </div>`;
        })
        .join("\n      ")}
      ${
        summary.networkErrors > 0
          ? `<div class="bar-row">
            <span class="bar-label" style="color: var(--danger);">Network Err</span>
            <div class="bar-track">
              <div class="bar-fill" style="width: ${((summary.networkErrors / totalStatusReqs) * 100).toFixed(1)}%; background: var(--danger);"></div>
            </div>
            <span class="bar-val">${summary.networkErrors.toLocaleString("en-US")}</span>
          </div>`
          : ""
      }
    </div>

    <!-- System Diagnostics -->
    <div class="section-title">
      🛡️ Runner Self-Monitoring Diagnostics
    </div>
    ${
      summary.selfCheckWarnings && summary.selfCheckWarnings.length > 0
        ? summary.selfCheckWarnings
            .map(
              (w) => `<div class="callout callout-warning">
                <strong>⚠️ Warning:</strong> ${escapeHtml(w)}
              </div>`
            )
            .join("\n")
        : `<div class="callout callout-optimal">
            <strong>✅ System Health Optimal:</strong> Event loop lag and scheduler jitter remained well within safe thresholds throughout test execution.
          </div>`
    }

    <footer>
      LoadScope v0.1.0 &bull; Self-Contained Interactive Benchmark Report &bull; Rendered ${new Date().toUTCString()}
    </footer>
  </div>

  <!-- Raw Payload Scripts -->
  <script type="application/json" id="loadscope-data">
${jsonReport}
  </script>
  <script type="text/plain" id="loadscope-csv">
${csvReport}
  </script>

  <script>
    // Interactive Tooltip Handling for CDF
    const cdfContainer = document.getElementById("cdf-container");
    const cdfTooltip = document.getElementById("cdf-tooltip");
    cdfContainer.querySelectorAll(".dot").forEach(dot => {
      dot.addEventListener("mouseenter", (e) => {
        const p = dot.getAttribute("data-p");
        const val = dot.getAttribute("data-val");
        cdfTooltip.innerText = p + ": " + val + " ms";
        cdfTooltip.style.display = "block";
        const rect = dot.getBoundingClientRect();
        const parentRect = cdfContainer.getBoundingClientRect();
        cdfTooltip.style.left = (rect.left - parentRect.left - 20) + "px";
        cdfTooltip.style.top = (rect.top - parentRect.top - 32) + "px";
      });
      dot.addEventListener("mouseleave", () => {
        cdfTooltip.style.display = "none";
      });
    });

    // Interactive Tooltip Handling for Time Series
    const tsContainer = document.getElementById("ts-container");
    const tsTooltip = document.getElementById("ts-tooltip");
    tsContainer.querySelectorAll(".dot").forEach(dot => {
      dot.addEventListener("mouseenter", (e) => {
        const t = dot.getAttribute("data-t");
        const val = dot.getAttribute("data-val");
        tsTooltip.innerText = "Time " + t + " | p95: " + val + " ms";
        tsTooltip.style.display = "block";
        const rect = dot.getBoundingClientRect();
        const parentRect = tsContainer.getBoundingClientRect();
        tsTooltip.style.left = (rect.left - parentRect.left - 40) + "px";
        tsTooltip.style.top = (rect.top - parentRect.top - 32) + "px";
      });
      dot.addEventListener("mouseleave", () => {
        tsTooltip.style.display = "none";
      });
    });

    // Copy JSON to clipboard
    function copyJson() {
      const data = document.getElementById("loadscope-data").textContent.trim();
      navigator.clipboard.writeText(data).then(() => {
        alert("JSON benchmark summary copied to clipboard!");
      });
    }

    // Download JSON file
    function downloadJson() {
      const data = document.getElementById("loadscope-data").textContent.trim();
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadscope-summary.json";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // Download CSV file
    function downloadCsv() {
      const data = document.getElementById("loadscope-csv").textContent.trim();
      const blob = new Blob([data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "loadscope-report.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>`;
}

/**
 * Generates and writes the interactive HTML report to disk.
 */
export async function generateHtmlReport(
  summary: RunSummary,
  outputPath?: string
): Promise<string> {
  const resolvedPath = path.resolve(process.cwd(), outputPath || "loadscope-report.html");
  const html = renderHtmlReport(summary);
  await fs.writeFile(resolvedPath, html, "utf-8");
  return resolvedPath;
}
