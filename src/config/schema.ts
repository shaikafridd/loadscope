import { z } from "zod";
import os from "node:os";
import type { RunOptions } from "../types.js";

/**
 * Parses duration inputs like "30s", "1m", "500ms", or raw numbers into seconds.
 */
export function parseDurationToSeconds(val: string | number): number {
  if (typeof val === "number") {
    if (val <= 0) throw new Error("Duration must be greater than 0");
    return val;
  }

  const trimmed = val.trim().toLowerCase();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/);
  if (!match) {
    throw new Error(`Invalid duration format: "${val}". Examples: "30s", "1m", "500ms"`);
  }

  const num = parseFloat(match[1]);
  const unit = match[2] || "s";

  switch (unit) {
    case "ms":
      return num / 1000;
    case "s":
      return num;
    case "m":
      return num * 60;
    case "h":
      return num * 3600;
    default:
      return num;
  }
}

/**
 * Parses header strings like ["Content-Type: application/json", "Authorization: Bearer token"]
 * into a Record<string, string>.
 */
export function parseHeaders(headersInput?: Record<string, string> | string[]): Record<string, string> {
  if (!headersInput) return {};
  if (!Array.isArray(headersInput)) return headersInput;

  const result: Record<string, string> = {};
  for (const item of headersInput) {
    const colonIdx = item.indexOf(":");
    if (colonIdx > 0) {
      const key = item.substring(0, colonIdx).trim();
      const val = item.substring(colonIdx + 1).trim();
      result[key] = val;
    }
  }
  return result;
}

/**
 * Resolves worker count when "auto" is requested.
 */
export function resolveWorkerCount(workers: number | "auto" | undefined, concurrency: number): number {
  if (workers === "auto") {
    const cpus = os.cpus()?.length || 1;
    return Math.max(1, Math.min(concurrency, cpus));
  }
  const count = typeof workers === "number" ? workers : 1;
  return Math.max(1, Math.min(concurrency, count));
}

/**
 * Schema validating options passed to LoadScope run.
 */
export const RunOptionsSchema = z.object({
  url: z.string().url("A valid URL starting with http:// or https:// is required"),
  duration: z.union([z.string(), z.number()]).default("10s").transform(parseDurationToSeconds),
  concurrency: z.coerce.number().int().min(1, "Concurrency must be at least 1").default(10),
  rate: z.coerce.number().positive().optional(),
  method: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
    .default("GET"),
  headers: z.record(z.string()).default({}),
  body: z.string().optional(),
  timeout: z.union([z.string(), z.number()]).default("10s").transform(parseDurationToSeconds),
  warmup: z.union([z.string(), z.number()]).optional().transform((v) => (v ? parseDurationToSeconds(v) : 0)),
  rampUp: z.union([z.string(), z.number()]).optional().transform((v) => (v ? parseDurationToSeconds(v) : 0)),
  mode: z.enum(["closed", "open"]).optional(),
  distribution: z.enum(["uniform", "poisson"]).default("uniform"),
  honest: z.boolean().default(false),
  ttfb: z.boolean().default(false),
  workers: z.union([z.coerce.number().int().min(1), z.literal("auto")]).default(1),
  dashboard: z.boolean().default(true),
  json: z.union([z.string(), z.boolean()]).optional(),
  csv: z.union([z.string(), z.boolean()]).optional(),
  pdf: z.string().optional(),
  aiReport: z.string().optional(),
  aiDryRun: z.boolean().default(false),
});

export type ValidatedRunOptions = z.infer<typeof RunOptionsSchema>;

/**
 * Validate and normalize run options.
 */
export function validateRunOptions(raw: Partial<RunOptions>): ValidatedRunOptions {
  // Normalize headers if an array was passed via CLI flags
  let headers = raw.headers;
  if (Array.isArray(headers)) {
    headers = parseHeaders(headers as unknown as string[]);
  }

  return RunOptionsSchema.parse({
    ...raw,
    headers: headers ?? {},
  });
}
