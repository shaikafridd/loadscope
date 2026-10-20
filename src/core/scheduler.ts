/**
 * High-precision arrival scheduler for open-model load testing.
 * Supports deterministic uniform intervals and stochastic Poisson arrival processes.
 */
export class ArrivalScheduler {
  private readonly rate: number;
  private readonly distribution: "uniform" | "poisson";
  private readonly startNs: bigint;
  private currentScheduledNs: bigint;
  private totalDriftNs = 0n;
  private sampleCount = 0;
  private maxDriftNs = 0n;

  constructor(rate: number, distribution: "uniform" | "poisson" = "uniform", startNs?: bigint) {
    this.rate = Math.max(0.1, rate);
    this.distribution = distribution;
    this.startNs = startNs ?? process.hrtime.bigint();
    this.currentScheduledNs = this.startNs;
  }

  /**
   * Generates the next scheduled arrival timestamp (in nanoseconds).
   */
  nextArrivalNs(): bigint {
    if (this.distribution === "poisson") {
      // Poisson process: inter-arrival time is exponentially distributed
      // Delta_t = -ln(U) / lambda
      const u = Math.max(1e-10, 1 - Math.random());
      const intervalSec = -Math.log(u) / this.rate;
      const intervalNs = BigInt(Math.max(1, Math.floor(intervalSec * 1_000_000_000)));
      this.currentScheduledNs += intervalNs;
    } else {
      // Uniform fixed arrival interval: Delta_t = 1 / lambda
      const intervalNs = BigInt(Math.max(1, Math.floor(1_000_000_000 / this.rate)));
      this.currentScheduledNs += intervalNs;
    }

    return this.currentScheduledNs;
  }

  /**
   * High-resolution pause until the target timestamp is reached.
   * Uses setTimeout for long waits and micro-spinning for sub-millisecond precision.
   */
  async waitUntil(targetNs: bigint): Promise<void> {
    const now = process.hrtime.bigint();
    if (now >= targetNs) {
      this.recordDrift(now - targetNs);
      return;
    }

    const diffNs = targetNs - now;
    const diffMs = Number(diffNs) / 1_000_000;

    // Yield event loop for sleeps longer than 2ms
    if (diffMs > 2) {
      await new Promise((resolve) => setTimeout(resolve, Math.floor(diffMs - 1)));
    }

    // Micro-spin for remaining sub-millisecond precision
    while (process.hrtime.bigint() < targetNs) {
      // Yield slightly if still noticeably ahead
      if (Number(targetNs - process.hrtime.bigint()) > 500_000) {
        await new Promise((r) => setImmediate(r));
      }
    }

    const actual = process.hrtime.bigint();
    this.recordDrift(actual > targetNs ? actual - targetNs : 0n);
  }

  private recordDrift(driftNs: bigint): void {
    this.totalDriftNs += driftNs;
    this.sampleCount++;
    if (driftNs > this.maxDriftNs) {
      this.maxDriftNs = driftNs;
    }
  }

  /**
   * Average schedule drift in milliseconds.
   */
  get averageDriftMs(): number {
    if (this.sampleCount === 0) return 0;
    return Number(this.totalDriftNs / BigInt(this.sampleCount)) / 1_000_000;
  }

  /**
   * Maximum schedule drift in milliseconds.
   */
  get maxDriftMs(): number {
    return Number(this.maxDriftNs) / 1_000_000;
  }
}
