export interface RunOptions {
  url: string;
  duration?: number; // seconds
  concurrency?: number;
  rate?: number; // requests per second for open model
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  pdf?: string;
  aiReport?: string;
  aiDryRun?: boolean;
}

export interface LatencyPoint {
  t: number; // second offset
  p95: number;
}

export interface RunSummary {
  target: string;
  rps: number;
  totalRequests: number;
  durationSec: number;
  p50: number; // in milliseconds
  p95: number; // in milliseconds
  p99: number; // in milliseconds
  errorRate: number; // 0..1
  statusCodes: Record<number, number>;
  series: LatencyPoint[];
  selfCheckWarnings?: string[];
}
