import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startTestServer } from "../test-server/index.js";
import { run } from "../src/index.js";

describe("Core Closed-Model Load Runner Integration", () => {
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

  it("successfully runs high-throughput test on root endpoint", async () => {
    const summary = await run({
      url: `${baseUrl}/`,
      concurrency: 10,
      duration: 1, // 1 second
      method: "GET",
    });

    expect(summary.totalRequests).toBeGreaterThan(10);
    expect(summary.rps).toBeGreaterThan(10);
    expect(summary.errorRate).toBe(0);
    expect(summary.statusCodes[200]).toBe(summary.totalRequests);
    expect(summary.p50).toBeGreaterThan(0);
    expect(summary.p90).toBeGreaterThanOrEqual(summary.p50);
    expect(summary.p95).toBeGreaterThanOrEqual(summary.p90);
    expect(summary.p99).toBeGreaterThanOrEqual(summary.p95);
    expect(summary.series.length).toBeGreaterThan(0);
  });

  it("correctly measures simulated latency on /delay/:ms", async () => {
    const delayMs = 30;
    const summary = await run({
      url: `${baseUrl}/delay/${delayMs}`,
      concurrency: 5,
      duration: 1, // 1 second
      method: "GET",
    });

    expect(summary.totalRequests).toBeGreaterThan(5);
    expect(summary.statusCodes[200]).toBe(summary.totalRequests);
    // p50 must accurately reflect the ~30ms server delay
    expect(summary.p50).toBeGreaterThanOrEqual(15);
  });

  it("accurately records simulated HTTP 500 status codes as errors", async () => {
    const summary = await run({
      url: `${baseUrl}/error?status=500`,
      concurrency: 5,
      duration: 1,
    });

    expect(summary.totalRequests).toBeGreaterThan(5);
    expect(summary.statusCodes[500]).toBe(summary.totalRequests);
    expect(summary.httpErrors).toBe(summary.totalRequests);
    // Crucial fix: errorRate must be 1 (100%), not 0%
    expect(summary.errorRate).toBe(1);
  });

  it("handles request timeouts cleanly on /stall endpoint", async () => {
    const summary = await run({
      url: `${baseUrl}/stall?ms=5000`,
      concurrency: 2,
      duration: 1,
      timeout: 0.2, // 200ms timeout
    });

    expect(summary.networkErrors).toBeGreaterThan(0);
    expect(summary.errorRate).toBe(1);
    expect(summary.p50).toBeGreaterThanOrEqual(100); // Timeout latency captured in histogram
    expect(Object.keys(summary.errorsByType).length).toBeGreaterThan(0);
  });

  it("executes open arrival model when rate is specified", async () => {
    const targetRps = 25;
    const summary = await run({
      url: `${baseUrl}/`,
      rate: targetRps,
      duration: 1,
      mode: "open",
    });

    expect(summary.totalRequests).toBeGreaterThanOrEqual(15);
    expect(summary.errorRate).toBe(0);
    expect(summary.p50).toBeGreaterThan(0);
  });

  it("supports warmup phase without including early samples", async () => {
    const summary = await run({
      url: `${baseUrl}/`,
      concurrency: 5,
      warmup: 0.5,
      duration: 1,
    });

    expect(summary.totalRequests).toBeGreaterThan(10);
    expect(summary.durationSec).toBeCloseTo(1, 0);
  });

  it("throws validation error for invalid URL", async () => {
    await expect(
      run({
        url: "not-a-valid-url",
        concurrency: 10,
        duration: 1,
      })
    ).rejects.toThrow();
  });
});
