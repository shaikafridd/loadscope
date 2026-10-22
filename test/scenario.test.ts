import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import {
  parseScenario,
  interpolateVariables,
  extractFromResponse,
  runScenario,
  formatScenarioTerminalReport,
} from "../src/index.js";
import { startTestServer } from "../test-server/index.js";

describe("Phase 9: Multi-Step Scenario Scripting & Synthetic User Journeys", () => {
  let server: http.Server;
  let testServerUrl: string;

  beforeAll(async () => {
    const res = await startTestServer({ port: 0 });
    server = res.server;
    testServerUrl = res.url;
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe("Variable Interpolation & Response Extraction", () => {
    it("interpolateVariables accurately replaces variables from session context", () => {
      const template = "Bearer {{token}} for user {{userId}} at {{path}}";
      const context = {
        token: "jwt-secret-xyz",
        userId: "9981",
        path: "/profile",
      };

      const result = interpolateVariables(template, context);
      expect(result).toBe("Bearer jwt-secret-xyz for user 9981 at /profile");
    });

    it("interpolateVariables preserves unknown tokens", () => {
      const template = "https://example.com/api/{{unknownVar}}";
      const result = interpolateVariables(template, {});
      expect(result).toBe("https://example.com/api/{{unknownVar}}");
    });

    it("extractFromResponse extracts values from JSON objects and nested arrays", () => {
      const body = JSON.stringify({
        status: "ok",
        token: "auth-12345",
        data: {
          user: {
            id: 42,
            roles: ["admin", "editor"],
          },
        },
      });

      const extracted = extractFromResponse(body, {}, {
        authToken: "json:token",
        userId: "json:data.user.id",
        firstRole: "json:data.user.roles[0]",
      });

      expect(extracted.authToken).toBe("auth-12345");
      expect(extracted.userId).toBe("42");
      expect(extracted.firstRole).toBe("admin");
    });

    it("extractFromResponse extracts values from regex patterns and headers", () => {
      const body = "session_token=abcdef789; max_age=3600";
      const headers = { "x-request-id": "req-999" };

      const extracted = extractFromResponse(body, headers, {
        sessionToken: "regex:session_token=([a-z0-9]+)",
        reqId: "header:x-request-id",
      });

      expect(extracted.sessionToken).toBe("abcdef789");
      expect(extracted.reqId).toBe("req-999");
    });
  });

  describe("YAML & JSON Scenario Parsing", () => {
    it("parseScenario parses and validates valid YAML scenario string", () => {
      const yamlContent = `
name: "E-Commerce User Journey"
target: "http://localhost:3000"
duration: "5s"
concurrency: 10
steps:
  - name: "Health Check"
    method: "GET"
    path: "/health"
    extract:
      systemStatus: "json:status"
  - name: "Fetch Delayed Resource"
    method: "GET"
    path: "/delay/10"
    thinkTime: "50ms"
`;

      const def = parseScenario(yamlContent);
      expect(def.name).toBe("E-Commerce User Journey");
      expect(def.target).toBe("http://localhost:3000");
      expect(def.steps).toHaveLength(2);
      expect(def.steps[0].name).toBe("Health Check");
      expect(def.steps[1].thinkTime).toBe("50ms");
    });

    it("parseScenario throws on missing steps or invalid URL", () => {
      const invalidYaml = `
name: "Broken Scenario"
target: "not-a-valid-url"
steps: []
`;
      expect(() => parseScenario(invalidYaml)).toThrow(/Invalid Scenario Definition/);
    });
  });

  describe("End-to-End Scenario Execution", () => {
    it("runScenario executes multi-step flow, extracts context, and measures per-step latencies", async () => {
      const scenarioYaml = `
name: "Full API Flow"
target: "${testServerUrl}"
duration: "1s"
concurrency: 4
steps:
  - name: "1. Ping Health"
    method: "GET"
    path: "/health"
    extract:
      srvStatus: "json:status"
  - name: "2. Fetch Latency with Think Time"
    method: "GET"
    path: "/delay/5"
    thinkTime: "10ms"
  - name: "3. Root Verification"
    method: "GET"
    path: "/?ref={{srvStatus}}"
`;

      const definition = parseScenario(scenarioYaml);
      const summary = await runScenario(definition, {
        duration: "1s",
        concurrency: 3,
      });

      expect(summary.name).toBe("Full API Flow");
      expect(summary.target).toBe(testServerUrl);
      expect(summary.completedJourneys).toBeGreaterThan(0);
      expect(summary.failedJourneys).toBe(0);
      expect(summary.journeysPerSec).toBeGreaterThan(0);
      expect(summary.journeyP50).toBeGreaterThan(0);

      // Verify Step 1
      expect(summary.steps[0].name).toBe("1. Ping Health");
      expect(summary.steps[0].totalRequests).toBeGreaterThan(0);
      expect(summary.steps[0].statusCodes[200]).toBeGreaterThan(0);

      // Verify Step 2
      expect(summary.steps[1].name).toBe("2. Fetch Latency with Think Time");
      expect(summary.steps[1].p50).toBeGreaterThan(0);

      // Verify Step 3
      expect(summary.steps[2].name).toBe("3. Root Verification");
      expect(summary.steps[2].totalRequests).toBeGreaterThan(0);

      // Verify terminal report formatting
      const report = formatScenarioTerminalReport(summary);
      expect(report).toContain("LoadScope Scenario Benchmark Results: Full API Flow");
      expect(report).toContain("1. Ping Health");
      expect(report).toContain("2. Fetch Latency");
      expect(report).toContain("3. Root Verification");
      expect(report).toContain("Waterfall Performance Breakdown");
    });
  });
});
