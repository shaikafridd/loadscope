# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-10-30

### Added
- **Multi-Step Scenario Scripting & Synthetic User Journeys (Phase 9)**:
  - Declarative YAML/JSON scenario DSL for modeling complex multi-step user workflows.
  - Session context variable extraction from JSON payloads (`json:path`), regular expressions (`regex:pattern`), and HTTP headers (`header:key`).
  - Runtime variable interpolation (`{{variable}}`) in request paths, headers, and request bodies.
  - Realistic human think-time simulation (`thinkTime: 250ms`) with high-resolution timers.
  - Step-by-step waterfall performance breakdown with per-step latency percentiles and error rates.
- **Production Version 1.0 Milestone**:
  - Full suite stability across all 13 test suites (63 passing tests).
  - Verified TypeScript compilation, declaration maps, and ES modules distribution.

## [0.1.0] - 2026-10-22

### Added
- **Core Load Engine (Phase 1)**: Single-core high-throughput closed concurrency runner powered by `undici` connection pooling.
- **Constant-Memory Histogram (Phase 1)**: $O(1)$ logarithmic histogram with 260 discrete buckets spanning $10\mu s$ to $60s$, eliminating GC pause skew.
- **Live Terminal Dashboard (Phase 2)**: Real-time 4 Hz console dashboard rendering live throughput, active connections, p95/p99 percentiles, and ASCII sparkline graphs using `log-update`.
- **Multi-Core Worker Pool (Phase 2)**: Multi-threaded execution scaling across available CPU cores (`-W auto` or `-W <n>`) with shared-nothing memory isolation.
- **Honest Latency & Open Model (Phase 3)**:
  - Open arrival scheduling supporting uniform and Poisson process arrival distributions (`--distribution uniform|poisson`).
  - Gil Tene Coordinated Omission correction backfilling virtual samples when servers stall under load (`--honest`).
  - Time-To-First-Byte (TTFB) measurement decoupling network transport from server processing (`--ttfb`).
- **Automated Breaking-Point Finder (Phase 4)**:
  - Stepped ramp load testing (`loadscope break <url>`) testing incremental capacity.
  - Automatic SLA breach detection monitoring p95/p99 latency ceilings and error budgets.
  - Bisection binary search refinement zeroing in on exact maximum stable throughput within user tolerance.
- **Baseline Comparison & CI Regression Gate (Phase 5)**:
  - Performance as Code baseline saving (`--save-baseline [path]`) and loading (`--baseline <path>`).
  - Directional delta calculations with noise tolerances (`--max-p95-increase`, `--max-rps-drop`).
  - CI exit code contract (fails with code `1` on regression) and automated GitHub Step Summary markdown tables.
  - Offline delta comparison subcommand (`loadscope compare <current.json> <baseline.json>`).
- **Vector PDF Generator & AI Diagnostics (Phase 6)**:
  - Zero-browser multi-page vector PDF report generator powered by `pdfkit` (`--pdf <path>`).
  - Native CDF latency percentile curves and Coordinated Omission breakdown tables.
  - Automated AI Performance Diagnostic Engine querying Google Gemini or OpenAI with local offline heuristic fallback (`--ai-report <path>`, `--ai-dry-run`).
- **Self-Contained Interactive HTML Report (Phase 7)**:
  - Portable, zero-external-dependency HTML report (`--html [path]`).
  - Embedded vector SVG interactive CDF curve and timeline scrubbers with zero CDN dependencies.
  - Client-side data export widgets (Copy JSON, Download JSON, Download CSV, Print/PDF).
- **TypeScript SDK**: Programmatic API (`import { run, runBreakingPoint } from "loadscope"`).
