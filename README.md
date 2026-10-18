# LoadScope

> A JavaScript load-testing CLI with a breaking-point finder, a CI regression gate, and script-built PDF reports with optional AI analysis.

## Key Features

- **Breaking-Point Finder**: Ramps traffic in steps until thresholds break (e.g. p95 > 300ms or error rate > 1%) and pinpoints exact capacity.
- **CI Regression Gate**: Compares current test runs against a committed `baseline.json` and fails CI builds if performance degrades.
- **Script-Built PDF Reports**: Offline, zero-API-key vector reports built with `pdfkit` (latency graphs, metrics tables, status code breakdown) with optional AI analysis via your own LLM key.
- **Honest Latency**: Open-model scheduling measures latency from intended send times, eliminating coordinated omission.
- **Fixed Memory**: Custom log-bucketed histogram keeps memory flat regardless of test duration or request count.
- **Self-Aware**: Monitored event loop and CPU load warn users if the test runner itself bottlenecks.

## Safety Notice

> **Important**: Only test servers you own or have explicit permission to test. Running uncoordinated load tests against unauthorized systems can disrupt services and violate terms of service.

## Quick Start

```bash
# Run directly via npx
npx loadscope --url http://localhost:3000 --concurrency 100 --duration 30s
```

## License

MIT
