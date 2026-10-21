import type { RunSummary } from "../types.js";

/**
 * Builds a structured, technical engineering prompt for an LLM to analyze load test results.
 */
export function buildAiDiagnosticPrompt(summary: RunSummary): string {
  const sections: string[] = [];

  sections.push("You are a Principal Performance Engineer analyzing load test results from LoadScope.");
  sections.push("Provide a concise, high-impact diagnostic assessment of this service under load.\n");

  sections.push("### Benchmark Configuration & Results:");
  sections.push(`- **Target URL:** ${summary.target}`);
  sections.push(`- **Test Duration:** ${summary.durationSec.toFixed(1)}s`);
  sections.push(`- **Total Requests Dispatched:** ${summary.totalRequests.toLocaleString()}`);
  sections.push(`- **Throughput:** ${summary.rps.toFixed(1)} req/s`);
  sections.push(`- **Error Rate:** ${(summary.errorRate * 100).toFixed(2)}% (${summary.networkErrors} network errors, ${summary.httpErrors} HTTP errors)`);
  sections.push(`- **Latency Percentiles:** p50=${summary.p50.toFixed(1)}ms, p90=${summary.p90.toFixed(1)}ms, p95=${summary.p95.toFixed(1)}ms, p99=${summary.p99.toFixed(1)}ms`);

  if (summary.serviceTime && summary.queueDelay) {
    sections.push("\n### Coordinated Omission Breakdown:");
    sections.push(`- **Server Service Time:** p50=${summary.serviceTime.p50.toFixed(1)}ms, p95=${summary.serviceTime.p95.toFixed(1)}ms`);
    sections.push(`- **Client Queueing Delay:** p50=${summary.queueDelay.p50.toFixed(1)}ms, p95=${summary.queueDelay.p95.toFixed(1)}ms`);
    sections.push(`- **Queue/Service Ratio:** ${summary.serviceTime.p95 > 0 ? (summary.queueDelay.p95 / summary.serviceTime.p95).toFixed(2) : "0.00"}x`);
  }

  if (summary.ttfb) {
    sections.push(`- **Time-To-First-Byte (TTFB):** p50=${summary.ttfb.p50.toFixed(1)}ms, p95=${summary.ttfb.p95.toFixed(1)}ms`);
  }

  if (summary.selfCheckWarnings && summary.selfCheckWarnings.length > 0) {
    sections.push("\n### System Bottleneck Warnings:");
    for (const w of summary.selfCheckWarnings) {
      sections.push(`- ⚠️ ${w}`);
    }
  }

  if (Object.keys(summary.errorsByType).length > 0) {
    sections.push("\n### Failure Breakdown:");
    for (const [type, count] of Object.entries(summary.errorsByType)) {
      sections.push(`- ${type}: ${count}`);
    }
  }

  sections.push("\n### Instructions:");
  sections.push("1. **Executive Health Summary**: One-sentence health diagnosis.");
  sections.push("2. **Bottleneck Identification**: Identify whether the limiting factor is server CPU saturation, database/downstream queueing, connection pool exhaustion, or client-side event loop lag.");
  sections.push("3. **Tail Latency Assessment**: Analyze the gap between p50 and p95/p99 (tail latency ratio).");
  sections.push("4. **Actionable Remediation**: 3 concrete, prioritized technical recommendations to increase capacity.");

  return sections.join("\n");
}

/**
 * Generates an automated AI diagnostic assessment for the summary.
 * If an API key is available (GEMINI_API_KEY or OPENAI_API_KEY or LLM_API_KEY),
 * it queries the LLM API; otherwise it returns a structured algorithmic assessment.
 */
export async function fetchAiDiagnostic(
  summary: RunSummary,
  explicitApiKey?: string
): Promise<string> {
  const geminiKey = explicitApiKey || process.env.GEMINI_API_KEY || process.env.LLM_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const prompt = buildAiDiagnosticPrompt(summary);

  // 1. Try Google Gemini API if key is present
  if (geminiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`;
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText) return candidateText;
      }
    } catch {
      // Fallback to local heuristic diagnosis if API call fails
    }
  }

  // 2. Try OpenAI API if key is present
  if (openaiKey) {
    try {
      const endpoint = "https://api.openai.com/v1/chat/completions";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.3,
        }),
      });

      if (res.ok) {
        const data = await res.json() as any;
        const reply = data?.choices?.[0]?.message?.content;
        if (reply) return reply;
      }
    } catch {
      // Fallback
    }
  }

  // 3. Fallback: High-grade heuristic senior performance diagnosis generated locally
  return generateLocalHeuristicDiagnostic(summary);
}

/**
 * Generates an offline heuristic diagnosis based on benchmark metrics.
 */
function generateLocalHeuristicDiagnostic(summary: RunSummary): string {
  const tailRatio = summary.p50 > 0 ? (summary.p95 / summary.p50).toFixed(1) : "1.0";
  const hasQueueDelay = summary.queueDelay && summary.serviceTime && summary.queueDelay.p95 > summary.serviceTime.p95;
  const hasHighErrors = summary.errorRate > 0.01;

  const lines: string[] = [];
  lines.push("### Executive Health Summary");
  if (hasHighErrors) {
    lines.push(`CRITICAL: Service degraded under load with ${(summary.errorRate * 100).toFixed(2)}% failure rate and severe tail latency.`);
  } else if (Number(tailRatio) > 4.0) {
    lines.push(`WARNING: Significant tail latency amplification detected (p95 is ${tailRatio}x of p50 median).`);
  } else {
    lines.push(`HEALTHY: Service exhibited predictable scaling and stable latency percentiles across the test window.`);
  }

  lines.push("\n### Bottleneck Identification");
  if (hasQueueDelay) {
    lines.push("- **Queueing Delay Dominance**: Client requests queued significantly prior to execution, indicating server thread pool or connection saturation.");
  } else if (hasHighErrors) {
    lines.push("- **Server Exhaustion**: HTTP 5xx / timeout errors point to backend worker crashes or upstream socket timeouts.");
  } else {
    lines.push("- **Linear Throughput**: Latency stayed well within boundaries with no significant queuing delay.");
  }

  lines.push("\n### Tail Latency Analysis");
  lines.push(`- Median latency: ${summary.p50.toFixed(1)}ms | p95: ${summary.p95.toFixed(1)}ms | p99: ${summary.p99.toFixed(1)}ms`);
  lines.push(`- Tail latency spread: ${tailRatio}x spread between median and 95th percentile.`);

  lines.push("\n### Prioritized Technical Recommendations");
  lines.push("1. **Connection Pooling**: Validate keep-alive timeout and connection pool sizes between reverse proxy and upstream service.");
  lines.push("2. **Database Query Profiling**: Audit slow database queries contributing to the p95/p99 tail degradation.");
  lines.push("3. **Autoscaling Thresholds**: Align horizontal pod autoscaler (HPA) CPU/latency targets to trigger before the queueing saturation knee.");

  return lines.join("\n");
}
