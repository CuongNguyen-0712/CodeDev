import { readFileSync } from "node:fs";

// CodeDev rate limiter for POST /submissions (the API in front of the submission queue).
// One token bucket per signed-in learner, a stricter bucket per IP address for anonymous traffic, and a
// global exam-day override. All times are fake-clock milliseconds; `now` never goes backwards.
//
// check(req, now) returns the decision for one POST /submissions:
//   1. Sweep first: remove every stored bucket that has been idle for at least idleTtlMs (now - its last
//      request >= idleTtlMs) AND would be full at `now` (its tokens after refill reach the capacity in
//      force). A bucket that is not full yet must stay, even when it is idle: re-creating it full would
//      hand out tokens the learner has not earned, and eviction must never change a decision.
//   2. Key: a request with a non-empty string userId is signed in -> bucket "user:<userId>" with
//      config.user. Otherwise a non-empty string ip makes it anonymous -> bucket "ip:<ip>" with
//      config.anonymous. Otherwise it is invalid: { status: 400, retryAfterSec: null, remaining: 0 } and no
//      bucket is created.
//   3. Limits in force at `now`: the bucket's own limit, except while config.examDay is set and
//      examDay.fromMs <= now < examDay.toMs: then capacity = min(own capacity, examDay.capacity) and
//      refillPerSec = min(own refillPerSec, examDay.refillPerSec).
//   4. Tokens are integers in micro-tokens (1 token = 1_000_000) so that the fake clock's milliseconds add
//      up exactly: a rate of r tokens per second adds Math.round(r * 1000) micro-tokens per millisecond.
//      A new bucket starts full (the capacity in force). An existing bucket refills lazily:
//      tokens = min(capacity in force, tokens + (now - last request) * rate in force).
//   5. At least 1 token: take 1 token -> { status: 200, retryAfterSec: null, remaining }.
//      Otherwise -> { status: 429, retryAfterSec, remaining } and take nothing. retryAfterSec is the
//      time until 1 whole token is available at the rate in force, rounded UP to whole seconds (a client
//      that comes back earlier is rejected again). remaining = whole tokens left after the decision
//      (Math.floor of tokens / 1_000_000).
//   Every request, allowed or rejected, counts as the bucket's last request.
// size() returns the number of buckets stored right now.
// Do not change the types or anything below the "do not change" line.

type Limit = { capacity: number; refillPerSec: number };
type Config = {
    user: Limit;
    anonymous: Limit;
    examDay: { fromMs: number; toMs: number; capacity: number; refillPerSec: number } | null;
    idleTtlMs: number;
};
type SubmitRequest = { userId?: unknown; ip?: unknown };
type Decision = { status: 200 | 400 | 429; retryAfterSec: number | null; remaining: number };

const TOKEN = 1_000_000;
type Bucket = { tokens: number; last: number; limit: Limit };

class SubmissionRateLimiter {
    private readonly buckets = new Map<string, Bucket>();
    private readonly config: Config;

    constructor(config: Config) {
        this.config = config;
    }

    private inForce(limit: Limit, now: number): { capacity: number; rate: number } {
        const exam = this.config.examDay;
        let capacity = limit.capacity;
        let perSec = limit.refillPerSec;
        if (exam !== null && exam.fromMs <= now && now < exam.toMs) {
            capacity = Math.min(capacity, exam.capacity);
            perSec = Math.min(perSec, exam.refillPerSec);
        }
        return { capacity: capacity * TOKEN, rate: Math.round(perSec * 1000) };
    }

    private refilled(bucket: Bucket, now: number): number {
        const { capacity, rate } = this.inForce(bucket.limit, now);
        return Math.min(capacity, bucket.tokens + (now - bucket.last) * rate);
    }

    check(req: SubmitRequest, now: number): Decision {
        for (const [key, bucket] of this.buckets) {
            const full = this.refilled(bucket, now) >= this.inForce(bucket.limit, now).capacity;
            if (now - bucket.last >= this.config.idleTtlMs && full) this.buckets.delete(key);
        }

        let key: string;
        let limit: Limit;
        // one bucket per client address; signed-in learners get the larger limit
        if (typeof req.ip === "string" && req.ip !== "") {
            key = `ip:${req.ip}`;
            limit = typeof req.userId === "string" && req.userId !== "" ? this.config.user : this.config.anonymous;
        } else {
            return { status: 400, retryAfterSec: null, remaining: 0 };
        }

        const { capacity, rate } = this.inForce(limit, now);
        let bucket = this.buckets.get(key);
        if (bucket === undefined) {
            bucket = { tokens: capacity, last: now, limit };
            this.buckets.set(key, bucket);
        } else {
            bucket.tokens = this.refilled(bucket, now);
            bucket.last = now;
        }

        if (bucket.tokens >= TOKEN) {
            bucket.tokens -= TOKEN;
            return { status: 200, retryAfterSec: null, remaining: Math.floor(bucket.tokens / TOKEN) };
        }
        const waitMs = Math.ceil((TOKEN - bucket.tokens) / rate);
        return { status: 429, retryAfterSec: Math.ceil(waitMs / 1000), remaining: Math.floor(bucket.tokens / TOKEN) };
    }

    size(): number {
        return this.buckets.size;
    }
}

// ---------------------------------------------------------------- test runner (do not change)
// Replays POST /submissions requests in time order (ties keep input order) and prints one line per
// request, the totals and the number of stored buckets (after the last request, and the most at once).
type Input = { config: Config; requests: Array<{ at: number; userId?: unknown; ip?: unknown }> };

function main(): void {
    const input: Input = JSON.parse(readFileSync(0, "utf8"));
    const limiter = new SubmissionRateLimiter(input.config);
    const requests = input.requests.map((r, i) => ({ r, i })).sort((a, b) => a.r.at - b.r.at || a.i - b.i);
    const results: string[] = [];
    const counts = { allowed: 0, rejected: 0, invalid: 0 };
    let maxBuckets = 0;
    for (const { r } of requests) {
        const d = limiter.check({ userId: r.userId, ip: r.ip }, r.at);
        const who = `${typeof r.userId === "string" && r.userId !== "" ? r.userId : "-"}@${typeof r.ip === "string" && r.ip !== "" ? r.ip : "-"}`;
        if (d.status === 200) counts.allowed++;
        else if (d.status === 429) counts.rejected++;
        else counts.invalid++;
        results.push(
            d.status === 429
                ? `t=${r.at} ${who} 429 retry-after=${d.retryAfterSec} remaining=${d.remaining}`
                : d.status === 200
                  ? `t=${r.at} ${who} 200 remaining=${d.remaining}`
                  : `t=${r.at} ${who} 400`,
        );
        maxBuckets = Math.max(maxBuckets, limiter.size());
    }
    console.log(JSON.stringify({ ...counts, buckets: limiter.size(), maxBuckets, results }));
}
main();
