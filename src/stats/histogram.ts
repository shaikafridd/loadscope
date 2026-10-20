export const GROWTH = 1.02;
export const BUCKETS = 1200; // 1.02^1200 us ≈ 21,114 seconds (~5.8 hours)

/**
 * Fixed-Memory Log-Bucketed Histogram.
 *
 * Storing raw latency arrays creates O(N) memory usage and triggers GC pauses.
 * This histogram uses a fixed Uint32Array(1200) (~4.8 KB of memory forever).
 * Relative error is bounded by (GROWTH - 1) ≈ 2%.
 */
export class Histogram {
  /** Fixed 4.8 KB bucket array of counts */
  readonly counts = new Uint32Array(BUCKETS);
  /** Total number of recorded samples */
  total = 0;

  private minVal = Infinity;
  private maxVal = 0;
  private sumUs = 0;

  /**
   * Calculate bucket index from latency in microseconds.
   * O(1) mathematical mapping.
   */
  private idx(us: number): number {
    if (us <= 1) return 0;
    const bucket = Math.floor(Math.log(us) / Math.log(GROWTH));
    return Math.min(BUCKETS - 1, Math.max(0, bucket));
  }

  /**
   * Reconstruct microsecond value from bucket index.
   */
  private valFromIdx(i: number): number {
    return Math.pow(GROWTH, i + 1);
  }

  /**
   * Record a latency value in microseconds (us).
   */
  record(us: number): void {
    const val = Math.max(0, us);
    const i = this.idx(val);
    this.counts[i]++;
    this.total++;
    this.sumUs += val;

    if (val < this.minVal) this.minVal = val;
    if (val > this.maxVal) this.maxVal = val;
  }

  /**
   * Merge another histogram into this one.
   * Merging is simple O(B) vector addition across the fixed bucket array.
   */
  merge(other: Histogram): void {
    for (let i = 0; i < BUCKETS; i++) {
      this.counts[i] += other.counts[i];
    }
    this.total += other.total;
    this.sumUs += other.sumUs;
    if (other.minVal < this.minVal) this.minVal = other.minVal;
    if (other.maxVal > this.maxVal) this.maxVal = other.maxVal;
  }

  /**
   * Calculate the given percentile (0..100) in microseconds (us).
   */
  percentile(p: number): number {
    if (this.total === 0) return 0;
    if (p <= 0) return this.min();
    if (p >= 100) return this.max();

    const target = Math.ceil((p / 100) * this.total);
    let seen = 0;

    for (let i = 0; i < BUCKETS; i++) {
      seen += this.counts[i];
      if (seen >= target) {
        const val = this.valFromIdx(i);
        return Math.min(Math.max(val, this.minVal), this.maxVal);
      }
    }

    return this.max();
  }

  /**
   * Return percentile in milliseconds (ms).
   */
  percentileMs(p: number): number {
    return this.percentile(p) / 1000;
  }

  /**
   * Minimum recorded latency in microseconds (us).
   */
  min(): number {
    return this.total === 0 ? 0 : this.minVal;
  }

  /**
   * Minimum recorded latency in milliseconds (ms).
   */
  minMs(): number {
    return this.min() / 1000;
  }

  /**
   * Maximum recorded latency in microseconds (us).
   */
  max(): number {
    return this.total === 0 ? 0 : this.maxVal;
  }

  /**
   * Maximum recorded latency in milliseconds (ms).
   */
  maxMs(): number {
    return this.max() / 1000;
  }

  /**
   * Mean (average) latency in microseconds (us).
   */
  mean(): number {
    return this.total === 0 ? 0 : this.sumUs / this.total;
  }

  /**
   * Mean (average) latency in milliseconds (ms).
   */
  meanMs(): number {
    return this.mean() / 1000;
  }

  /**
   * Reset all bucket counts and statistics.
   */
  reset(): void {
    this.counts.fill(0);
    this.total = 0;
    this.sumUs = 0;
    this.minVal = Infinity;
    this.maxVal = 0;
  }

  /**
   * Export raw snapshot data for inter-thread messaging (worker_threads).
   */
  toSnapshot(): { counts: Uint32Array; total: number; minVal: number; maxVal: number; sumUs: number } {
    return {
      counts: new Uint32Array(this.counts),
      total: this.total,
      minVal: this.minVal,
      maxVal: this.maxVal,
      sumUs: this.sumUs,
    };
  }

  /**
   * Restore or merge from a worker snapshot.
   */
  mergeSnapshot(snapshot: { counts: Uint32Array; total: number; minVal: number; maxVal: number; sumUs: number }): void {
    for (let i = 0; i < BUCKETS; i++) {
      this.counts[i] += snapshot.counts[i];
    }
    this.total += snapshot.total;
    this.sumUs += snapshot.sumUs;
    if (snapshot.minVal < this.minVal) this.minVal = snapshot.minVal;
    if (snapshot.maxVal > this.maxVal) this.maxVal = snapshot.maxVal;
  }
}
