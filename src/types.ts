export interface RunOptions {
  url: string;
  duration?: number; // seconds
  concurrency?: number;
  rate?: number; // requests per second for open model
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
  loopLagMaxMs: number;
  loopLagP99Ms: number;
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
  p50: number; // in milliseconds
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
}
