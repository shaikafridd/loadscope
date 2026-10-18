import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import { startTestServer } from "../test-server/index.js";

describe("LoadScope Controllable Test Server", () => {
  let serverInstance: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    // Port 0 picks a free port dynamically to prevent conflicts
    const result = await startTestServer({ port: 0 });
    serverInstance = result.server;
    baseUrl = result.url;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      serverInstance.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("responds with 200 OK for root endpoint", async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("handles controllable latency on /delay/:ms", async () => {
    const start = Date.now();
    const delay = 50;
    const res = await fetch(`${baseUrl}/delay/${delay}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(delay - 10);
    const body = await res.json();
    expect(body.delayed).toBe(delay);
  });

  it("returns error code for /error endpoint", async () => {
    const res = await fetch(`${baseUrl}/error?status=503`);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe(503);
  });

  it("returns 404 for unknown endpoint", async () => {
    const res = await fetch(`${baseUrl}/unknown-route`);
    expect(res.status).toBe(404);
  });
});
