import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import pdfParse from "pdf-parse";
import {
  generatePdfReport,
  buildAiDiagnosticPrompt,
  fetchAiDiagnostic,
} from "../src/index.js";
import type { RunSummary } from "../src/types.js";

describe("Phase 6: Vector PDF & AI Diagnostics", () => {
  const testPdfPaths: string[] = [];

  const sampleSummary: RunSummary = {
    target: "https://api.example.com/checkout",
    rps: 3450.2,
    totalRequests: 34502,
    durationSec: 10.0,
    p50: 14.2,
    p90: 28.5,
    p95: 45.1,
    p99: 112.4,
    p999: 230.8,
    max: 380.0,
    errorRate: 0.02,
    networkErrors: 5,
    httpErrors: 685,
    statusCodes: {
      200: 33812,
      500: 685,
    },
    errorsByType: {
      UND_ERR_SOCKET_TIMEOUT: 5,
    },
    serviceTime: {
      p50: 14.2,
      p90: 28.5,
      p95: 45.1,
      p99: 112.4,
      min: 5.0,
      max: 380.0,
      mean: 20.0,
    },
    queueDelay: {
      p50: 2.1,
      p90: 12.3,
      p95: 30.2,
      p99: 80.5,
      min: 0.1,
      max: 120.0,
      mean: 5.5,
    },
    ttfb: {
      p50: 8.5,
      p95: 22.1,
      p99: 55.4,
      p90: 18.0,
      min: 3.0,
      max: 80.0,
      mean: 10.0,
    },
    series: [
      { t: 1, p95: 35.0 },
      { t: 2, p95: 42.0 },
      { t: 3, p95: 48.0 },
      { t: 4, p95: 45.1 },
    ],
    selfCheckWarnings: [
      "Process event loop lag peaked at 18.2ms during test ramp",
    ],
  };

  afterEach(async () => {
    while (testPdfPaths.length > 0) {
      const p = testPdfPaths.pop();
      if (p) {
        try {
          await fs.unlink(p);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  it("buildAiDiagnosticPrompt constructs detailed technical metrics for LLM evaluation", () => {
    const prompt = buildAiDiagnosticPrompt(sampleSummary);

    expect(prompt).toContain("https://api.example.com/checkout");
    expect(prompt).toContain("3450.2 req/s");
    expect(prompt).toContain("p95=45.1ms");
    expect(prompt).toContain("Coordinated Omission Breakdown");
    expect(prompt).toContain("Server Service Time");
    expect(prompt).toContain("Client Queueing Delay");
    expect(prompt).toContain("UND_ERR_SOCKET_TIMEOUT");
    expect(prompt).toContain("Process event loop lag peaked");
  });

  it("fetchAiDiagnostic returns expert heuristic report when no API key is provided", async () => {
    const diagnosis = await fetchAiDiagnostic(sampleSummary);

    expect(diagnosis).toContain("Executive Health Summary");
    expect(diagnosis).toContain("Bottleneck Identification");
    expect(diagnosis).toContain("Tail Latency Analysis");
    expect(diagnosis).toContain("Prioritized Technical Recommendations");
  });

  it("generatePdfReport creates a 3-page vector PDF with valid header and metadata", async () => {
    const outPath = path.join(os.tmpdir(), `loadscope-test-${Date.now()}.pdf`);
    testPdfPaths.push(outPath);

    const generatedPath = await generatePdfReport(sampleSummary, outPath);
    expect(generatedPath).toBe(outPath);

    const fileBuffer = await fs.readFile(outPath);
    expect(fileBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");

    const parsed = await pdfParse(fileBuffer);
    expect(parsed.numpages).toBe(3);
    expect(parsed.text).toContain("LoadScope Performance Benchmark Report");
    expect(parsed.text).toContain("https://api.example.com/checkout");
    expect(parsed.text).toContain("Latency Percentile Curve (CDF)");
    expect(parsed.text).toContain("Time-Series Progression & System Health");
    expect(parsed.text).toContain("Coordinated Omission Breakdown");
  });

  it("generatePdfReport includes optional 4th AI assessment page when aiAnalysis is supplied", async () => {
    const outPath = path.join(os.tmpdir(), `loadscope-ai-test-${Date.now()}.pdf`);
    testPdfPaths.push(outPath);

    const mockAiDiagnostic = `### 1. Executive Summary
The target backend shows signs of downstream database saturation under concurrency.

### 2. Root Cause Analysis
High queue delays (30.20ms) indicate thread pool starvation.`;

    await generatePdfReport(sampleSummary, outPath, mockAiDiagnostic);

    const fileBuffer = await fs.readFile(outPath);
    const parsed = await pdfParse(fileBuffer);

    expect(parsed.numpages).toBe(4);
    expect(parsed.text).toContain("Executive AI Performance Diagnostic");
    expect(parsed.text).toContain("downstream database saturation");
    expect(parsed.text).toContain("thread pool starvation");
  });
});
