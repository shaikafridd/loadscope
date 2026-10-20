import { run } from "../index.js";
import { parseDurationToSeconds } from "../config/schema.js";
import type {
  BreakpointOptions,
  BreakpointSummary,
  BreakpointStepResult,
  BreakpointLimits,
  RunSummary,
} from "../types.js";

/**
 * Evaluates whether a RunSummary breaches the configured SLA / error thresholds.
 */
function evaluateThresholds(
  summary: RunSummary,
  limits: BreakpointLimits
): { status: "PASS" | "BREACH"; breachReason?: string } {
  if (summary.errorRate > limits.maxErrorRate) {
    return {
      status: "BREACH",
      breachReason: `Error rate ${(summary.errorRate * 100).toFixed(2)}% exceeded limit ${(limits.maxErrorRate * 100).toFixed(2)}%`,
    };
  }

  if (limits.maxP95 !== undefined && summary.p95 > limits.maxP95) {
    return {
      status: "BREACH",
      breachReason: `p95 latency ${summary.p95.toFixed(1)}ms exceeded limit ${limits.maxP95}ms`,
    };
  }

  if (limits.maxP99 !== undefined && summary.p99 > limits.maxP99) {
    return {
      status: "BREACH",
      breachReason: `p99 latency ${summary.p99.toFixed(1)}ms exceeded limit ${limits.maxP99}ms`,
    };
  }

  return { status: "PASS" };
}

/**
 * Executes a single load evaluation step.
 */
async function executeStep(
  options: BreakpointOptions,
  load: number,
  stepDurationSec: number
): Promise<RunSummary> {
  const isRate = options.mode === "rate";

  return await run({
    url: options.url,
    duration: stepDurationSec,
    concurrency: isRate ? Math.max(10, Math.ceil(load / 10)) : load,
    rate: isRate ? load : undefined,
    mode: isRate ? "open" : "closed",
    distribution: options.distribution || "uniform",
    honest: options.honest ?? true,
    workers: options.workers || 1,
    method: options.method || "GET",
    headers: options.headers,
    body: options.body,
    timeout: typeof options.timeout === "number" || typeof options.timeout === "string"
      ? parseDurationToSeconds(options.timeout)
      : undefined,
    dashboard: false,
  });
}

/**
 * Runs the Breaking-Point Finder: stepped ramp + binary search capacity detection.
 */
export async function runBreakingPoint(options: BreakpointOptions): Promise<BreakpointSummary> {
  const mode = options.mode || "concurrency";
  const start = options.start ?? 10;
  const max = options.max ?? 100;
  const step = options.step ?? 10;
  const stepDurationSec = options.stepDuration
    ? parseDurationToSeconds(options.stepDuration)
    : 5;
  const refine = options.refine ?? true;
  const tolerance = options.tolerance ?? 2;

  const limits: BreakpointLimits = {
    maxP95: options.maxP95 ?? 300,
    maxP99: options.maxP99,
    maxErrorRate: options.maxErrorRate ?? 0.01,
  };

  const steps: BreakpointStepResult[] = [];
  const refinementSteps: BreakpointStepResult[] = [];

  let lastSafeLoad: number | undefined;
  let firstBreachedLoad: number | undefined;
  let primaryBreachReason: string | undefined;

  let stepCounter = 1;

  // 1. STEPPED RAMP PHASE
  for (let load = start; load <= max; load += step) {
    if (options.onStepStart) {
      options.onStepStart(stepCounter, load, false);
    }

    const summary = await executeStep(options, load, stepDurationSec);
    const { status, breachReason } = evaluateThresholds(summary, limits);

    const stepResult: BreakpointStepResult = {
      stepIndex: stepCounter,
      load,
      rps: summary.rps,
      p50: summary.p50,
      p95: summary.p95,
      p99: summary.p99,
      errorRate: summary.errorRate,
      totalRequests: summary.totalRequests,
      networkErrors: summary.networkErrors,
      httpErrors: summary.httpErrors,
      status,
      breachReason,
      isRefinement: false,
      summary,
    };

    steps.push(stepResult);

    if (options.onStepComplete) {
      options.onStepComplete(stepResult);
    }

    if (status === "BREACH") {
      firstBreachedLoad = load;
      primaryBreachReason = breachReason;
      break;
    } else {
      lastSafeLoad = load;
    }

    stepCounter++;
  }

  // 2. BINARY SEARCH REFINEMENT PHASE
  let breakingPoint: number | undefined = firstBreachedLoad;

  if (firstBreachedLoad !== undefined && refine && lastSafeLoad !== undefined) {
    let low = lastSafeLoad;
    let high = firstBreachedLoad;

    while (high - low > tolerance) {
      const mid = Math.floor((low + high) / 2);
      if (mid === low || mid === high) {
        break;
      }

      stepCounter++;
      if (options.onStepStart) {
        options.onStepStart(stepCounter, mid, true);
      }

      const summary = await executeStep(options, mid, stepDurationSec);
      const { status, breachReason } = evaluateThresholds(summary, limits);

      const refResult: BreakpointStepResult = {
        stepIndex: stepCounter,
        load: mid,
        rps: summary.rps,
        p50: summary.p50,
        p95: summary.p95,
        p99: summary.p99,
        errorRate: summary.errorRate,
        totalRequests: summary.totalRequests,
        networkErrors: summary.networkErrors,
        httpErrors: summary.httpErrors,
        status,
        breachReason,
        isRefinement: true,
        summary,
      };

      refinementSteps.push(refResult);

      if (options.onStepComplete) {
        options.onStepComplete(refResult);
      }

      if (status === "BREACH") {
        high = mid;
        breakingPoint = mid;
        primaryBreachReason = breachReason;
      } else {
        low = mid;
      }
    }
  }

  const safeCapacity = breakingPoint !== undefined
    ? Math.max(1, Math.floor((lastSafeLoad ?? breakingPoint) * 0.8))
    : max;
  const breached = breakingPoint !== undefined;

  return {
    target: options.url,
    mode,
    start,
    max,
    step,
    stepDurationSec,
    breakingPoint,
    safeCapacity,
    breached,
    breachReason: primaryBreachReason,
    steps,
    refinementSteps,
    limits,
  };
}
