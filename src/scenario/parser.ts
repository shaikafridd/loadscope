import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { z } from "zod";
import type { ScenarioDefinition, ScenarioStep } from "../types.js";

const StepSchema = z.object({
  name: z.string().min(1, "Step name cannot be empty"),
  method: z.string().default("GET"),
  path: z.string().optional(),
  url: z.string().optional(),
  headers: z.record(z.string()).optional(),
  body: z.string().optional(),
  extract: z.record(z.string()).optional(),
  thinkTime: z.union([z.string(), z.number()]).optional(),
});

const ScenarioSchema = z.object({
  name: z.string().min(1, "Scenario name cannot be empty"),
  target: z.string().url("Scenario target must be a valid base URL"),
  duration: z.union([z.string(), z.number()]).default("10s"),
  concurrency: z.number().int().positive().default(10),
  timeout: z.union([z.string(), z.number()]).default("10s"),
  steps: z.array(StepSchema).min(1, "Scenario must contain at least 1 step"),
});

/**
 * Replaces all occurrences of {{varName}} in a template string with values from context.
 */
export function interpolateVariables(template: string, context: Record<string, string>): string {
  if (!template || Object.keys(context).length === 0) return template;
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, varName) => {
    return context[varName] !== undefined ? String(context[varName]) : `{{${varName}}}`;
  });
}

/**
 * Traverses a nested object using dot-notation (e.g. "user.profile.id" or "items[0].id").
 */
function getNestedProp(obj: any, propPath: string): any {
  if (!obj || !propPath) return undefined;
  const parts = propPath.replace(/\[(\w+)\]/g, ".$1").split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Extracts variables from an HTTP response using configured extraction rules.
 */
export function extractFromResponse(
  body: string,
  headers: Record<string, string | string[] | undefined>,
  rules: Record<string, string>
): Record<string, string> {
  const extracted: Record<string, string> = {};
  if (!rules || Object.keys(rules).length === 0) return extracted;

  let parsedJson: any = null;
  let jsonParsedAttempted = false;

  for (const [varName, rule] of Object.entries(rules)) {
    const colonIdx = rule.indexOf(":");
    if (colonIdx === -1) continue;

    const type = rule.substring(0, colonIdx).trim().toLowerCase();
    const query = rule.substring(colonIdx + 1).trim();

    if (type === "json") {
      if (!jsonParsedAttempted) {
        try {
          parsedJson = JSON.parse(body);
        } catch {
          parsedJson = null;
        }
        jsonParsedAttempted = true;
      }
      if (parsedJson) {
        const val = getNestedProp(parsedJson, query);
        if (val !== undefined && val !== null) {
          extracted[varName] = String(val);
        }
      }
    } else if (type === "regex") {
      try {
        const match = body.match(new RegExp(query));
        if (match) {
          extracted[varName] = match[1] !== undefined ? match[1] : match[0];
        }
      } catch {
        // invalid regex or no match
      }
    } else if (type === "header") {
      const headerKey = query.toLowerCase();
      for (const [k, v] of Object.entries(headers)) {
        if (k.toLowerCase() === headerKey && v != null) {
          extracted[varName] = Array.isArray(v) ? v[0] : String(v);
          break;
        }
      }
    }
  }

  return extracted;
}

/**
 * Parses and validates a ScenarioDefinition from a raw YAML/JSON string or file path.
 */
export function parseScenario(input: string): ScenarioDefinition {
  let content = input;

  // Check if input is a file path
  if (
    input.endsWith(".yaml") ||
    input.endsWith(".yml") ||
    input.endsWith(".json") ||
    (fs.existsSync(input) && fs.statSync(input).isFile())
  ) {
    const resolved = path.resolve(process.cwd(), input);
    content = fs.readFileSync(resolved, "utf-8");
  }

  let raw: unknown;
  try {
    raw = YAML.parse(content);
  } catch (yamlErr) {
    try {
      raw = JSON.parse(content);
    } catch {
      throw new Error(`Failed to parse scenario content as YAML or JSON: ${yamlErr instanceof Error ? yamlErr.message : String(yamlErr)}`);
    }
  }

  const result = ScenarioSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `[${i.path.join(".")}] ${i.message}`).join(", ");
    throw new Error(`Invalid Scenario Definition: ${issues}`);
  }

  return result.data as ScenarioDefinition;
}
