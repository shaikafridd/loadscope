import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startTestServer } from "../test-server/index.js";
import { run } from "../src/index.js";
import { executeMultiThreaded } from "../src/core/multi-runner.js";
import { validateRunOptions } from "../src/config/schema.js";

describe("Phase 2 Multi-Core Worker Threads Runner", () => {
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

  it("successfully distributes closed concurrency across 2 worker threads", async () => {
    const summary = await run({
      url: `${baseUrl}/`,
      concurrency: 6,
      workers: 2,
      duration: 1, // 1 second
      dashboard: false,
    });

    expect(summary.workerCount).toBe(2);
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

  it("accurately aggregates status codes and errors across multiple workers", async () => {
    const summary = await run({
      url: `${baseUrl}/error?status=500`,
      concurrency: 4,
      workers: 2,
      duration: 1,
      dashboard: false,
    });

    expect(summary.workerCount).toBe(2);
    expect(summary.totalRequests).toBeGreaterThan(10);
    expect(summary.statusCodes[500]).toBe(summary.totalRequests);
    expect(summary.httpErrors).toBe(summary.totalRequests);
    expect(summary.errorRate).toBe(1);
  });

  it("supports open arrival model distributed across worker threads", async () => {
    const summary = await run({
      url: `${baseUrl}/`,
      rate: 30,
      workers: 2,
      duration: 1,
      mode: "open",
      dashboard: false,
    });

    expect(summary.workerCount).toBe(2);
    expect(summary.totalRequests).toBeGreaterThanOrEqual(20);
    expect(summary.errorRate).toBe(0);
    expect(summary.p50).toBeGreaterThan(0);
  });

  it("resolves workers 'auto' to available cores capped by concurrency", async () => {
    const validated = validateRunOptions({
      url: `${baseUrl}/`,
      concurrency: 3,
      workers: "auto",
      duration: 1,
      dashboard: false,
    });

    const summary = await executeMultiThreaded(validated);
    expect(summary.workerCount).toBeLessThanOrEqual(3);
    expect(summary.workerCount).toBeGreaterThanOrEqual(1);
    expect(summary.totalRequests).toBeGreaterThan(10);
  });
});
