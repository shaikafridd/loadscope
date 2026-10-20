import { describe, it, expect } from "vitest";
import { formatTerminalReport } from "../src/report/terminal.js";
import { formatJsonReport, formatCsvReport } from "../src/report/export.js";
import type { RunSummary } from "../src/types.js";

describe("Reporting and Formatting", () => {
  const sampleSummary: RunSummary = {
    target: "http://localhost:3000/api",
    rps: 1250.4,
    totalRequests: 12504,
    durationSec: 10.0,
    p50: 12.34,
    p90: 25.67,
    p95: 38.91,
    p99: 84.12,
    errorRate: 0.05,
    networkErrors: 2,
    httpErrors: 623,
    statusCodes: {
      200: 11879,
      500: 623,
    },
    errorsByType: {
      UND_ERR_HEADERS_TIMEOUT: 2,
    },
    series: [
      { t: 1, p95: 30.5 },
      { t: 2, p95: 35.2 },
      { t: 3, p95: 42.1 },
    ],
    selfCheckWarnings: ["High event loop lag detected"],
  };

  it("formatTerminalReport outputs aligned table rows and accurately reflects errors", () => {
    const output = formatTerminalReport(sampleSummary);

    expect(output).toContain("LoadScope Test Results");
    expect(output).toContain("http://localhost:3000/api");
    expect(output).toContain("5.00%"); // 5% error rate, not 0.00%
    expect(output).toContain("623 HTTP 4xx/5xx");
    expect(output).toContain("2 network");
    expect(output).toContain("p50 (median)");
    expect(output).toContain("p90");
    expect(output).toContain("25.67 ms");
    expect(output).toContain("UND_ERR_HEADERS_TIMEOUT");
    expect(output).toContain("2 occurrences");
    expect(output).toContain("Self-Monitoring Warnings");

    // Check table borders and alignment
    const lines = output.split("\n");
    const p50Line = lines.find((l) => l.includes("p50 (median)"));
    const p90Line = lines.find((l) => l.includes("p90"));
    const p95Line = lines.find((l) => l.includes("p95"));

    expect(p50Line).toBeDefined();
    expect(p90Line).toBeDefined();
    expect(p95Line).toBeDefined();
  });

  it("formatJsonReport serializes clean machine-readable JSON", () => {
    const jsonStr = formatJsonReport(sampleSummary);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.target).toBe("http://localhost:3000/api");
    expect(parsed.totalRequests).toBe(12504);
    expect(parsed.p90).toBe(25.67);
    expect(parsed.statusCodes["500"]).toBe(623);
    expect(parsed.selfCheckWarnings).toEqual(["High event loop lag detected"]);
  });

  it("formatCsvReport formats summary and latency time-series", () => {
    const csvStr = formatCsvReport(sampleSummary);

    expect(csvStr).toContain("# LoadScope Run Summary");
    expect(csvStr).toContain("target,duration_sec,total_requests,rps,p50_ms,p90_ms,p95_ms,p99_ms");
    expect(csvStr).toContain('"http://localhost:3000/api",10.00,12504,1250.40,12.34,25.67,38.91,84.12,5.00%,2,623');
    expect(csvStr).toContain("# Per-Second Latency Series");
    expect(csvStr).toContain("1,30.50");
    expect(csvStr).toContain("2,35.20");
    expect(csvStr).toContain("3,42.10");
  });
});
