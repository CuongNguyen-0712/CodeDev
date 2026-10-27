import { readFileSync } from "node:fs";

// Latency of POST /submissions, as Prometheus scrapes it from every API instance:
//   http_server_request_duration_seconds_bucket{le="0.1"} 180    <- requests that took <= 0.1 s, since the process started
// Each instance gives two snapshots of its cumulative buckets: at the start and at the end of the window.
// Compute what this PromQL query computes, on those two snapshots:
//   histogram_quantile(q, sum by (le) (increase(http_server_request_duration_seconds_bucket[window])))
//
// counterIncrease(start, end): how much a counter grew between two snapshots. A counter only goes up,
//   so an end value lower than the start value means the process restarted and the counter began again
//   at 0: the increase is then the end value. Otherwise it is end - start.
//
// mergeIncreases(instances): for every instance and every bucket of its "end" snapshot, the increase of
//   that bucket (counterIncrease of the start and end counts with the same le; a bucket missing from
//   "start" - the instance started during the window - starts at 0). Then add the increases of all
//   instances bucket by bucket (same le). Return one bucket per le, sorted by le ascending (+Inf last).
//
// histogramQuantile(q, buckets): the q-quantile of cumulative buckets sorted by le, like Prometheus:
//   1. q < 0 -> -Infinity; q > 1 -> Infinity.
//   2. No +Inf bucket, or fewer than 2 buckets -> NaN. total = count of the +Inf bucket; total 0 -> NaN.
//   3. rank = q * total. Find the first bucket other than +Inf whose count >= rank.
//   4. None (the rank falls in the +Inf bucket) -> return the le of the highest bucket other than +Inf.
//   5. Otherwise interpolate linearly inside that bucket: lower = le of the previous bucket (0 for the
//      first bucket), before = count of the previous bucket (0 for the first bucket):
//      lower + (le - lower) * (rank - before) / (count - before)
//
// Do not change the types or anything below the "do not change" line.

type Bucket = { le: number; count: number }; // le: upper bound in seconds, Infinity for le="+Inf"
type Instance = { instance: string; start: Bucket[]; end: Bucket[] };

function counterIncrease(start: number, end: number): number {
    return end < start ? end : end - start;
}

function mergeIncreases(instances: Instance[]): Bucket[] {
    const sums = new Map<number, number>();
    for (const instance of instances) {
        const startCounts = new Map(instance.start.map((b): [number, number] => [b.le, b.count]));
        for (const b of instance.end) {
            const increase = counterIncrease(startCounts.get(b.le) ?? 0, b.count);
            sums.set(b.le, (sums.get(b.le) ?? 0) + increase);
        }
    }
    return [...sums].map(([le, count]) => ({ le, count })).sort((a, b) => a.le - b.le);
}

function histogramQuantile(q: number, buckets: Bucket[]): number {
    if (q < 0) return -Infinity;
    if (q > 1) return Infinity;
    const sorted = [...buckets].sort((a, b) => a.le - b.le);
    if (sorted.length < 2 || sorted[sorted.length - 1].le !== Infinity) return NaN;
    const total = sorted[sorted.length - 1].count;
    if (total === 0) return NaN;
    const rank = q * total;
    const finite = sorted.slice(0, -1);
    const i = finite.findIndex((b) => b.count >= rank);
    if (i === -1) return finite[finite.length - 1].le;
    const lower = i === 0 ? 0 : finite[i - 1].le;
    const before = i === 0 ? 0 : finite[i - 1].count;
    return lower + ((finite[i].le - lower) * (rank - before)) / (finite[i].count - before);
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "windowSeconds": 300, "quantiles": [0.5, 0.95, 0.99], "instances": [{ "instance": "api-1",
//   "start": [{ "le": "0.1", "count": 180 }, ..., { "le": "+Inf", "count": 400 }], "end": [...] }] }
// Output: the request count and rate of the window (the +Inf bucket), then one line per quantile in
// milliseconds, rounded to the nearest millisecond (NaN, +Inf and -Inf are printed as such).
type RawBucket = { le: string; count: number };
type Input = {
    windowSeconds: number;
    quantiles: number[];
    instances: Array<{ instance: string; start: RawBucket[]; end: RawBucket[] }>;
};

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const parse = (buckets: RawBucket[]): Bucket[] =>
    buckets.map((b) => ({ le: b.le === "+Inf" ? Infinity : Number(b.le), count: b.count }));
const instances: Instance[] = input.instances.map((i) => ({ instance: i.instance, start: parse(i.start), end: parse(i.end) }));
const merged = mergeIncreases(instances);
const inf = merged.find((b) => b.le === Infinity);
const total = inf ? inf.count : 0;
console.log(`requests ${total} in ${input.windowSeconds} s = ${(total / input.windowSeconds).toFixed(3)}/s`);
for (const q of input.quantiles) {
    const value = histogramQuantile(q, merged);
    const shown = Number.isNaN(value) ? "NaN" : value === Infinity ? "+Inf" : value === -Infinity ? "-Inf" : `${Math.round(value * 1000)} ms`;
    console.log(`p${Number((q * 100).toFixed(4))} ${shown}`);
}
