import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { startTestServer } from "../test-server/index.js";
import { runBreakingPoint } from "../src/modes/breaking-point.js";
import { formatBreakpointTerminalReport } from "../src/report/breakpoint-terminal.js";
import { formatBreakpointJsonReport, formatBreakpointCsvReport } from "../src/report/export.js";
import type { Server } from "node:http";

describe("Phase 4 Breaking-Point Finder & Capacity Detection", () => {
  let serverInstance: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const { server, url } = await startTestServer({ port: 0 });
    serverInstance = server;
    baseUrl = url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      serverInstance.closeAllConnections?.();
      serverInstance.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("completes full ramp without breach when system sustains all load levels", async () => {
    const summary = await runBreakingPoint({
      url: `${baseUrl}/`,
      start: 5,
      max: 15,
      step: 5,
      stepDuration: 1, // 1s per step
      maxP95: 300,
      maxErrorRate: 0.01,
      refine: true,
    });

    expect(summary.breached).toBe(false);
    expect(summary.breakingPoint).toBeUndefined();
    expect(summary.safeCapacity).toBe(15);
    expect(summary.steps.length).toBe(3); // 5, 10, 15
    for (const step of summary.steps) {
      expect(step.status).toBe("PASS");
    }
  });

  it("detects breaking point early when latency SLA is breached", async () => {
    // Latency is 150ms, while SLA is set to 80ms
    const summary = await runBreakingPoint({
      url: `${baseUrl}/delay/150`,
      start: 5,
      max: 20,
      step: 5,
      stepDuration: 1,
      maxP95: 80,
      maxErrorRate: 0.01,
      refine: false, // Refine disabled
    });

    expect(summary.breached).toBe(true);
    expect(summary.breakingPoint).toBe(5);
    expect(summary.steps.length).toBe(1); // Halts immediately at step 1
    expect(summary.steps[0].status).toBe("BREACH");
    expect(summary.breachReason).toContain("p95 latency");
  });

  it("detects breaking point when error budget is exceeded", async () => {
    const summary = await runBreakingPoint({
      url: `${baseUrl}/error?status=500`,
      start: 4,
      max: 12,
      step: 4,
      stepDuration: 1,
      maxErrorRate: 0.05, // 5% limit
      refine: false,
    });

    expect(summary.breached).toBe(true);
    expect(summary.breakingPoint).toBe(4);
    expect(summary.steps[0].status).toBe("BREACH");
    expect(summary.breachReason).toContain("Error rate");
  });

  it("executes binary search refinement to narrow breaking capacity", async () => {
    // Dynamic capacity limit set to 10 connections
    const summary = await runBreakingPoint({
      url: `${baseUrl}/capacity?limit=10&slow=250`,
      start: 5,
      max: 25,
      step: 10, // steps: 5 (pass), 15 (breach > limit 10)
      stepDuration: 1,
      maxP95: 100,
      tolerance: 2,
      refine: true,
    });

    expect(summary.breached).toBe(true);
    expect(summary.steps.length).toBe(2); // Step 1: 5 (pass), Step 2: 15 (breach)
    expect(summary.steps[0].status).toBe("PASS");
    expect(summary.steps[1].status).toBe("BREACH");
    expect(summary.refinementSteps.length).toBeGreaterThan(0);
    expect(summary.breakingPoint).toBeDefined();
    expect(summary.safeCapacity).toBeDefined();
    expect(summary.safeCapacity!).toBeLessThan(summary.breakingPoint!);
  });

  it("formats terminal report, JSON, and CSV accurately", async () => {
    const summary = await runBreakingPoint({
      url: `${baseUrl}/`,
      start: 4,
      max: 8,
      step: 4,
      stepDuration: 1,
      maxP95: 200,
      refine: false,
    });

    // Terminal report test
    const termReport = formatBreakpointTerminalReport(summary);
    expect(termReport).toContain("LoadScope Breaking-Point Capacity Analysis");
    expect(termReport).toContain("Outcome");
    expect(termReport).toContain("PASS");

    // JSON export test
    const jsonReport = formatBreakpointJsonReport(summary);
    const parsed = JSON.parse(jsonReport);
    expect(parsed.target).toBe(summary.target);
    expect(parsed.steps).toHaveLength(2);

    // CSV export test
    const csvReport = formatBreakpointCsvReport(summary);
    expect(csvReport).toContain("# LoadScope Breaking-Point Summary");
    expect(csvReport).toContain("# Step Progression");
    expect(csvReport).toContain("step,is_refinement,load,rps");
  });
});
