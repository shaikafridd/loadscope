export interface RunOptions {
  url: string;
  duration?: number; // seconds
  concurrency?: number;
  rate?: number; // requests per second for open model
  distribution?: "uniform" | "poisson";
  honest?: boolean; // enable Coordinated Omission correction
  ttfb?: boolean; // track Time-To-First-Byte
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number; // seconds
  warmup?: number; // seconds
  rampUp?: number; // seconds
  mode?: "closed" | "open";
  workers?: number | "auto";
  dashboard?: boolean;
  json?: string | boolean;
  csv?: string | boolean;
  pdf?: string;
  aiReport?: string;
  aiDryRun?: boolean;
}

export interface LatencyPoint {
  t: number; // second offset
  p95: number;
}

export interface LatencyDistribution {
  p50: number; // in milliseconds
  p90: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
}

export interface HistogramSnapshot {
  counts: Uint32Array;
  total: number;
  minVal: number;
  maxVal: number;
  sumUs: number;
}

export interface WorkerInitData {
  workerIndex: number;
  totalWorkers: number;
  url: string;
  duration: number;
  concurrency: number;
  rate?: number;
  distribution?: "uniform" | "poisson";
  honest?: boolean;
  ttfb?: boolean;
  method: string;
  headers: Record<string, string>;
  body?: string;
  timeout: number;
  warmup: number;
  rampUp: number;
  mode: "closed" | "open";
}

export interface WorkerTickMessage {
  type: "tick";
  workerIndex: number;
  elapsedSec: number;
  dispatched: number;
  networkErrors: number;
  httpErrors: number;
  statusCodes: Record<number, number>;
  errorsByType: Record<string, number>;
  windowSnapshot: HistogramSnapshot;
  cumulativeSnapshot: HistogramSnapshot;
  serviceTimeSnapshot?: HistogramSnapshot;
  ttfbSnapshot?: HistogramSnapshot;
  loopLagMs: number;
}

export interface WorkerDoneMessage {
  type: "done";
  workerIndex: number;
  dispatched: number;
  networkErrors: number;
  httpErrors: number;
  statusCodes: Record<number, number>;
  errorsByType: Record<string, number>;
  finalSnapshot: HistogramSnapshot;
  serviceTimeSnapshot?: HistogramSnapshot;
  ttfbSnapshot?: HistogramSnapshot;
  loopLagMaxMs: number;
  loopLagP99Ms: number;
  avgDriftMs?: number;
}

export interface WorkerErrorMessage {
  type: "error";
  workerIndex: number;
  error: string;
}

export type WorkerMessage = WorkerTickMessage | WorkerDoneMessage | WorkerErrorMessage;

export interface RunSummary {
  target: string;
  rps: number;
  totalRequests: number;
  durationSec: number;
  p50: number; // in milliseconds (Honest Total Latency)
  p90: number; // in milliseconds
  p95: number; // in milliseconds
  p99: number; // in milliseconds
  errorRate: number; // 0..1 (combined network + HTTP 4xx/5xx failures)
  networkErrors: number;
  httpErrors: number;
  statusCodes: Record<number, number>;
  errorsByType: Record<string, number>;
  series: LatencyPoint[];
  selfCheckWarnings: string[];
  workerCount?: number;
  distribution?: "uniform" | "poisson";
  serviceTime?: LatencyDistribution;
  queueDelay?: LatencyDistribution;
  ttfb?: LatencyDistribution;
  scheduleDriftMs?: number;
}

export interface BreakpointLimits {
  maxP95?: number; // ms
  maxP99?: number; // ms
  maxErrorRate: number; // 0..1 (e.g. 0.01 for 1%)
}

export interface BreakpointStepResult {
  stepIndex: number;
  load: number; // concurrency count or target RPS
  rps: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  totalRequests: number;
  networkErrors: number;
  httpErrors: number;
  status: "PASS" | "BREACH";
  breachReason?: string;
  isRefinement?: boolean;
  summary: RunSummary;
}

export interface BreakpointSummary {
  target: string;
  mode: "concurrency" | "rate";
  start: number;
  max: number;
  step: number;
  stepDurationSec: number;
  breakingPoint?: number;
  safeCapacity?: number;
  breached: boolean;
  breachReason?: string;
  steps: BreakpointStepResult[];
  refinementSteps: BreakpointStepResult[];
  limits: BreakpointLimits;
}

export interface BreakpointOptions {
  url: string;
  mode?: "concurrency" | "rate";
  start?: number;
  max?: number;
  step?: number;
  stepDuration?: string | number; // e.g. "5s" or 5
  maxP95?: number; // ms, default 300
  maxP99?: number; // ms
  maxErrorRate?: number; // 0..1, default 0.01
  refine?: boolean; // enable binary search refinement, default true
  tolerance?: number; // binary search convergence threshold, default 2
  workers?: number | "auto";
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number | string;
  honest?: boolean;
  distribution?: "uniform" | "poisson";
  json?: string | boolean;
  csv?: string | boolean;
  onStepStart?: (stepNumber: number, load: number, isRefinement?: boolean) => void;
  onStepComplete?: (result: BreakpointStepResult) => void;
}
