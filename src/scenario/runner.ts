import { Pool } from "undici";
import { performance } from "node:perf_hooks";
import { Histogram } from "../stats/histogram.js";
import { parseDurationToSeconds } from "../config/schema.js";
import { interpolateVariables, extractFromResponse } from "./parser.js";
import type {
  ScenarioDefinition,
  ScenarioSummary,
  StepSummary,
  RunSummary,
  RunOptions,
} from "../types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ScenarioRunOverrides {
  concurrency?: number;
  duration?: number | string;
  timeout?: number | string;
}

/**
 * Executes a multi-step user journey scenario with concurrent virtual users.
 */
export async function runScenario(
  definition: ScenarioDefinition,
  overrides?: ScenarioRunOverrides
): Promise<ScenarioSummary> {
  const concurrency = overrides?.concurrency ?? definition.concurrency ?? 10;
  const durationSec = parseDurationToSeconds(overrides?.duration ?? definition.duration ?? "10s");
  const timeoutSec = parseDurationToSeconds(overrides?.timeout ?? definition.timeout ?? "10s");

  const urlObj = new URL(definition.target);
  const pool = new Pool(urlObj.origin, {
    connections: Math.max(concurrency * 2, 10),
    pipelining: 1,
    keepAliveTimeout: 10_000,
  });

  const stepCount = definition.steps.length;
  const stepHistograms: Histogram[] = Array.from({ length: stepCount }, () => new Histogram());
  const stepStatusCodes: Record<number, number>[] = Array.from({ length: stepCount }, () => ({}));
  const stepErrorsByType: Record<string, number>[] = Array.from({ length: stepCount }, () => ({}));
  const stepNetworkErrors: number[] = new Array(stepCount).fill(0);
  const stepHttpErrors: number[] = new Array(stepCount).fill(0);

  const journeyHistogram = new Histogram();
  let totalJourneysStarted = 0;
  let completedJourneys = 0;
  let failedJourneys = 0;

  const overallHistogram = new Histogram();
  const overallStatusCodes: Record<number, number> = {};
  const overallErrorsByType: Record<string, number> = {};
  let overallNetworkErrors = 0;
  let overallHttpErrors = 0;

  const testStartTime = performance.now();
  const endTime = testStartTime + durationSec * 1000;
  let running = true;

  // Worker task for a single virtual user session
  async function virtualUserLoop(): Promise<void> {
    while (running && performance.now() < endTime) {
      totalJourneysStarted++;
      const journeyStart = performance.now();
      const sessionContext: Record<string, string> = {};
      let journeyFailed = false;

      for (let s = 0; s < stepCount; s++) {
        if (!running || performance.now() >= endTime) break;

        const step = definition.steps[s];

        // 1. Handle Think Time if defined
        if (step.thinkTime) {
          const thinkMs = parseDurationToSeconds(step.thinkTime) * 1000;
          if (thinkMs > 0) {
            await sleep(thinkMs);
          }
        }

        // 2. Interpolate path/URL, headers, body
        const rawPath = step.path ? interpolateVariables(step.path, sessionContext) : "";
        const rawUrl = step.url ? interpolateVariables(step.url, sessionContext) : "";
        const fullPath = rawUrl ? new URL(rawUrl).pathname + new URL(rawUrl).search : rawPath || "/";
        const method = (step.method || "GET").toUpperCase();

        const headers: Record<string, string> = {};
        if (step.headers) {
          for (const [k, v] of Object.entries(step.headers)) {
            headers[k] = interpolateVariables(v, sessionContext);
          }
        }

        const body = step.body ? interpolateVariables(step.body, sessionContext) : undefined;

        // 3. Dispatch Request
        const reqStart = performance.now();
        try {
          const response = await pool.request({
            path: fullPath,
            method: method as any,
            headers,
            body,
            headersTimeout: timeoutSec * 1000,
            bodyTimeout: timeoutSec * 1000,
          });

          const bodyText = await response.body.text();
          const latencyUs = Math.max(1, Math.round((performance.now() - reqStart) * 1000));

          // Record step metrics
          stepHistograms[s].record(latencyUs);
          overallHistogram.record(latencyUs);

          const statusCode = response.statusCode;
          stepStatusCodes[s][statusCode] = (stepStatusCodes[s][statusCode] || 0) + 1;
          overallStatusCodes[statusCode] = (overallStatusCodes[statusCode] || 0) + 1;

          if (statusCode >= 400) {
            stepHttpErrors[s]++;
            overallHttpErrors++;
            journeyFailed = true;
          }

          // 4. Extract Variables for subsequent steps
          if (step.extract) {
            const extracted = extractFromResponse(bodyText, response.headers as any, step.extract);
            Object.assign(sessionContext, extracted);
          }
        } catch (err: unknown) {
          const latencyUs = Math.max(1, Math.round((performance.now() - reqStart) * 1000));
          stepHistograms[s].record(latencyUs);
          overallHistogram.record(latencyUs);

          stepNetworkErrors[s]++;
          overallNetworkErrors++;

          const errCode = (err as any)?.code || (err instanceof Error ? err.name : "UNKNOWN_ERROR");
          stepErrorsByType[s][errCode] = (stepErrorsByType[s][errCode] || 0) + 1;
          overallErrorsByType[errCode] = (overallErrorsByType[errCode] || 0) + 1;

          journeyFailed = true;
          break; // Stop remaining steps on connection failure
        }
      }

      if (journeyFailed) {
        failedJourneys++;
      } else {
        completedJourneys++;
        const journeyDurationUs = Math.max(1, Math.round((performance.now() - journeyStart) * 1000));
        journeyHistogram.record(journeyDurationUs);
      }
    }
  }

  // Spawn concurrency virtual users
  const workers = Array.from({ length: concurrency }, () => virtualUserLoop());
  await Promise.all(workers);
  running = false;

  await pool.close();

  const actualDurationSec = Math.max((performance.now() - testStartTime) / 1000, 0.001);

  // Compile Step Summaries
  const steps: StepSummary[] = definition.steps.map((step, idx) => {
    const hist = stepHistograms[idx];
    const total = hist.total;
    const rps = total / actualDurationSec;
    const errCount = stepNetworkErrors[idx] + stepHttpErrors[idx];
    const errorRate = total > 0 ? errCount / total : 0;

    return {
      name: step.name,
      method: (step.method || "GET").toUpperCase(),
      path: step.path || step.url || "/",
      totalRequests: total,
      rps,
      p50: hist.percentile(50) / 1000,
      p90: hist.percentile(90) / 1000,
      p95: hist.percentile(95) / 1000,
      p99: hist.percentile(99) / 1000,
      min: hist.minMs(),
      max: hist.maxMs(),
      mean: hist.meanMs(),
      errorRate,
      statusCodes: stepStatusCodes[idx],
      networkErrors: stepNetworkErrors[idx],
      httpErrors: stepHttpErrors[idx],
    };
  });

  const overallTotal = overallHistogram.total;
  const overallErrTotal = overallNetworkErrors + overallHttpErrors;
  const overallSummary: RunSummary = {
    target: definition.target,
    rps: overallTotal / actualDurationSec,
    totalRequests: overallTotal,
    durationSec: actualDurationSec,
    p50: overallHistogram.percentile(50) / 1000,
    p90: overallHistogram.percentile(90) / 1000,
    p95: overallHistogram.percentile(95) / 1000,
    p99: overallHistogram.percentile(99) / 1000,
    errorRate: overallTotal > 0 ? overallErrTotal / overallTotal : 0,
    networkErrors: overallNetworkErrors,
    httpErrors: overallHttpErrors,
    statusCodes: overallStatusCodes,
    errorsByType: overallErrorsByType,
    series: [],
    selfCheckWarnings: [],
  };

  return {
    name: definition.name,
    target: definition.target,
    durationSec: actualDurationSec,
    concurrency,
    totalJourneys: totalJourneysStarted,
    completedJourneys,
    failedJourneys,
    journeysPerSec: completedJourneys / actualDurationSec,
    journeyP50: journeyHistogram.percentile(50) / 1000,
    journeyP90: journeyHistogram.percentile(90) / 1000,
    journeyP95: journeyHistogram.percentile(95) / 1000,
    journeyP99: journeyHistogram.percentile(99) / 1000,
    steps,
    overallSummary,
  };
}
