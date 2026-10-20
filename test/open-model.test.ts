import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startTestServer } from "../test-server/index.js";
import { run } from "../src/index.js";
import { ArrivalScheduler } from "../src/core/scheduler.js";
import { formatTerminalReport } from "../src/report/terminal.js";

describe("Phase 3 Open-Model Arrival Scheduling & Honest Latency", () => {
  let serverInstance: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const result = await startTestServer({ port: 0 });
    serverInstance = result.server;
    baseUrl = result.url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      serverInstance.closeAllConnections?.();
      serverInstance.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("schedules uniform arrival intervals with exact mathematical precision", () => {
    const rate = 100; // 100 req/s -> 10,000,000 ns per request
    const scheduler = new ArrivalScheduler(rate, "uniform", 0n);

    const t1 = scheduler.nextArrivalNs();
    const t2 = scheduler.nextArrivalNs();
    const t3 = scheduler.nextArrivalNs();

    expect(t1).toBe(10_000_000n);
    expect(t2 - t1).toBe(10_000_000n);
    expect(t3 - t2).toBe(10_000_000n);
  });

  it("schedules Poisson arrival intervals with exponential distribution matching rate", () => {
    const rate = 100;
    const scheduler = new ArrivalScheduler(rate, "poisson", 0n);

    let prev = 0n;
    let totalIntervalNs = 0n;
    const count = 2000;

    for (let i = 0; i < count; i++) {
      const next = scheduler.nextArrivalNs();
      totalIntervalNs += next - prev;
      prev = next;
    }

    const avgIntervalMs = Number(totalIntervalNs / BigInt(count)) / 1_000_000;
    // Expected average interval for rate 100 is 10ms
    expect(avgIntervalMs).toBeGreaterThan(8.0);
    expect(avgIntervalMs).toBeLessThan(12.0);
  });

  it("executes open model with Poisson distribution, dual latency tracking, and TTFB", async () => {
    const summary = await run({
      url: `${baseUrl}/delay/25`,
      rate: 20,
      distribution: "poisson",
      ttfb: true,
      duration: 1,
      mode: "open",
      dashboard: false,
    });

    expect(summary.distribution).toBe("poisson");
    expect(summary.totalRequests).toBeGreaterThanOrEqual(10);
    expect(summary.errorRate).toBe(0);

    // Dual-latency metrics
    expect(summary.serviceTime).toBeDefined();
    expect(summary.serviceTime!.p50).toBeGreaterThanOrEqual(20);
    expect(summary.p50).toBeGreaterThanOrEqual(summary.serviceTime!.p50);

    // TTFB breakdown
    expect(summary.ttfb).toBeDefined();
    expect(summary.ttfb!.p50).toBeGreaterThan(0);
    expect(summary.ttfb!.p50).toBeLessThanOrEqual(summary.serviceTime!.p50 + 25);

    // Queue delay breakdown
    expect(summary.queueDelay).toBeDefined();
    expect(summary.queueDelay!.p50).toBeGreaterThanOrEqual(0);

    // Verify terminal report formats the Coordinated Omission breakdown table
    const terminalReport = formatTerminalReport(summary);
    expect(terminalReport).toContain("Coordinated Omission Breakdown");
    expect(terminalReport).toContain("Service Time");
    expect(terminalReport).toContain("Queue Delay");
    expect(terminalReport).toContain("Honest Total");
    expect(terminalReport).toContain("Time-To-First-Byte");
  });

  it("supports Gil Tene honest correction on closed model", async () => {
    const summary = await run({
      url: `${baseUrl}/delay/10`,
      concurrency: 5,
      duration: 1,
      honest: true,
      ttfb: true,
      dashboard: false,
    });

    expect(summary.totalRequests).toBeGreaterThan(10);
    expect(summary.p50).toBeGreaterThanOrEqual(8);
    expect(summary.ttfb).toBeDefined();
  });
});
