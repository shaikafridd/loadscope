import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { renderHtmlReport, generateHtmlReport } from "../src/index.js";
import type { RunSummary } from "../src/types.js";

describe("Phase 7: Self-Contained Interactive HTML Report", () => {
  const testHtmlPaths: string[] = [];

  const sampleSummary: RunSummary = {
    target: "https://api.example.com/orders",
    rps: 4210.5,
    totalRequests: 42105,
    durationSec: 10.0,
    p50: 12.4,
    p90: 24.8,
    p95: 38.6,
    p99: 89.2,
    p999: 165.0,
    max: 220.0,
    errorRate: 0.015,
    networkErrors: 3,
    httpErrors: 628,
    statusCodes: {
      200: 41474,
      500: 628,
    },
    errorsByType: {
      UND_ERR_SOCKET_TIMEOUT: 3,
    },
    serviceTime: {
      p50: 11.2,
      p90: 22.0,
      p95: 33.1,
      p99: 72.5,
      min: 4.0,
      max: 200.0,
      mean: 16.5,
    },
    queueDelay: {
      p50: 1.2,
      p90: 2.8,
      p95: 5.5,
      p99: 16.7,
      min: 0.1,
      max: 45.0,
      mean: 2.1,
    },
    ttfb: {
      p50: 6.8,
      p90: 14.5,
      p95: 19.2,
      p99: 45.0,
      min: 2.5,
      max: 95.0,
      mean: 8.5,
    },
    series: [
      { t: 1, p95: 32.0 },
      { t: 2, p95: 35.5 },
      { t: 3, p95: 41.2 },
      { t: 4, p95: 38.6 },
    ],
    selfCheckWarnings: [
      "Process event loop lag peaked at 16.5ms during test ramp",
    ],
  };

  afterEach(async () => {
    while (testHtmlPaths.length > 0) {
      const p = testHtmlPaths.pop();
      if (p) {
        try {
          await fs.unlink(p);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  it("renderHtmlReport produces a standalone, self-contained HTML5 document", () => {
    const html = renderHtmlReport(sampleSummary);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html lang=\"en\">");
    expect(html).toContain("https://api.example.com/orders");
    expect(html).toContain("4,210.5"); // Throughput
    expect(html).toContain("38.6 ms"); // p95
    expect(html).toContain("1.50%"); // Error rate
    expect(html).toContain("Latency Percentile Curve (CDF)");
    expect(html).toContain("Coordinated Omission Breakdown");
    expect(html).toContain("Per-Second p95 Latency Progression");
    expect(html).toContain("HTTP Status & Reliability Breakdown");
    expect(html).toContain("Process event loop lag peaked at 16.5ms");

    // Embedded raw JSON and CSV scripts
    expect(html).toContain("id=\"loadscope-data\"");
    expect(html).toContain("id=\"loadscope-csv\"");

    // Zero external dependencies / CDNs verification
    expect(html).not.toMatch(/<script\s+src=["']http/i);
    expect(html).not.toMatch(/<link\s+[^>]*href=["']http/i);
  });

  it("generateHtmlReport creates an HTML file on disk and verifies accessibility", async () => {
    const outPath = path.join(os.tmpdir(), `loadscope-report-${Date.now()}.html`);
    testHtmlPaths.push(outPath);

    const generatedPath = await generateHtmlReport(sampleSummary, outPath);
    expect(generatedPath).toBe(outPath);

    const content = await fs.readFile(outPath, "utf-8");
    expect(content).toContain("Executive Load Performance Analysis");
    expect(content).toContain("<svg viewBox=");
    expect(content).toContain("copyJson()");
    expect(content).toContain("downloadJson()");
    expect(content).toContain("downloadCsv()");
  });

  it("renders healthy runner stability callout when no warnings exist", () => {
    const cleanSummary: RunSummary = {
      ...sampleSummary,
      selfCheckWarnings: [],
    };

    const html = renderHtmlReport(cleanSummary);
    expect(html).toContain("System Health Optimal");
    expect(html).not.toContain("Process event loop lag peaked");
  });
});
