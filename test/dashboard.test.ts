import { describe, it, expect } from "vitest";
import { LiveDashboard, type DashboardStats } from "../src/report/dashboard.js";

describe("Phase 2 Live Terminal Dashboard", () => {
  it("formats live dashboard with progress bar, throughput gauge, and percentiles", () => {
    const dashboard = new LiveDashboard(false); // disable actual stdout writes for test

    const stats: DashboardStats = {
      target: "http://127.0.0.1:3000/api",
      elapsedSec: 4.5,
      totalDurationSec: 10.0,
      totalRequests: 4500,
      currentRps: 1000.0,
      p50Ms: 1.25,
      p90Ms: 2.85,
      p95Ms: 4.12,
      networkErrors: 0,
      httpErrors: 0,
      workerCount: 4,
      mode: "closed",
    };

    const text = dashboard.formatDashboard(stats);

    expect(text).toContain("LoadScope Live Monitor");
    expect(text).toContain("http://127.0.0.1:3000/api");
    expect(text).toContain("45%");
    expect(text).toContain("Throughput:");
    expect(text).toContain("1,000.0");
    expect(text).toContain("req/s");
    expect(text).toContain("Total Requests:");
    expect(text).toContain("4,500");
    expect(text).toContain("p50:");
    expect(text).toContain("1.25ms");
    expect(text).toContain("p90:");
    expect(text).toContain("2.85ms");
    expect(text).toContain("p95:");
    expect(text).toContain("4.12ms");
    expect(text).toContain("Workers:");
    expect(text).toContain("active");
    expect(text).toContain("0.00%");
  });

  it("accurately displays warnings and error rates in dashboard", () => {
    const dashboard = new LiveDashboard(false);

    const stats: DashboardStats = {
      target: "http://127.0.0.1:3000/api",
      elapsedSec: 2.0,
      totalDurationSec: 5.0,
      totalRequests: 200,
      currentRps: 100.0,
      p50Ms: 5.0,
      p90Ms: 15.0,
      p95Ms: 350.0,
      networkErrors: 5,
      httpErrors: 15,
      workerCount: 2,
      mode: "closed",
      warnings: ["Worker event loop lag detected"],
    };

    const text = dashboard.formatDashboard(stats);

    expect(text).toContain("10.00%");
    expect(text).toContain("20 fails");
    expect(text).toContain("Worker event loop lag detected");
    expect(text).toContain("Workers:");
    expect(text).toContain("active");
  });
});
