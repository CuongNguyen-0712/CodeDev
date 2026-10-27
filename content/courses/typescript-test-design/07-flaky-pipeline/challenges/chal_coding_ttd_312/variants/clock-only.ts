import { readFileSync } from "node:fs";

// Fix the Flaky Pipeline. The CodeDev "trial week" module keeps a small leaderboard for learners
// on a 7-day trial and tells them when the trial ends. Its tests go red about one CI run in five:
// sometimes the trial end is off, sometimes the ranking comes back in a different order, and a
// re-run with the same code is green. Locally, one test at a time, everything passes.
//
// The test runner below runs the same scenario many times, like CI on a busy day: each run starts
// a cohort with a fake clock (a different start time per run), gives it the awards in a shuffled
// order (a fixed seed, so the orders are always the same), and prints every different answer it
// saw. A correct module gives ONE answer per start time, whatever the order and whatever ran before.
//
// Fix startCohort so that:
//   - trialEndsAt() is 7 days after the moment the cohort started, rounded down to the whole
//     second, where "started" is the time the injected clock `now` returned when startCohort ran;
//   - ranking() lists every learner with points as "name points", most points first, and learners
//     with the same points in alphabetical order of name;
//   - every cohort starts empty: nothing from an earlier cohort shows up in a new one.
// Awards whose points are not a positive whole number are ignored (that part already works).
// Do not change the test runner.

type Clock = () => number; // milliseconds since 1970-01-01T00:00:00Z, like Date.now()

type Cohort = {
    award(learner: string, points: number): void;
    ranking(): string[];
    trialEndsAt(): string;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_DAYS = 7;

// Points per learner, kept at module level so creating a cohort is cheap.
const totals = new Map<string, number>();

function startCohort(now: Clock): Cohort {
    return {
        award(learner: string, points: number): void {
            if (!Number.isInteger(points) || points <= 0) return;
            totals.set(learner, (totals.get(learner) ?? 0) + points);
        },
        ranking(): string[] {
            return [...totals].map(([learner, points]) => `${learner} ${points}`);
        },
        trialEndsAt(): string {
            const startedAt = Math.floor(now() / 1000) * 1000;
            return new Date(startedAt + TRIAL_DAYS * DAY_MS).toISOString();
        },
    };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "runs": 100, "seed": 7, "starts": ["2030-03-01T09:00:00.999Z", ...],
//          "awards": [{ "learner": "an", "points": 120 }, ...] }
// Run i starts a cohort with a clock fixed at starts[i % starts.length], gives it the awards in an
// order shuffled by a seeded random generator, then reads ranking() and trialEndsAt().
// Output: every different answer and the number of runs that gave it (at most 3 shown per line).
type Award = { learner: string; points: number };
type Input = { runs: number; seed: number; starts: string[]; awards: Award[] };

function seededRandom(seed: number): () => number {
    let a = seed >>> 0; // mulberry32: same seed, same sequence
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled<T>(items: T[], random: () => number): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

function tally(answers: Map<string, number>, answer: string): void {
    answers.set(answer, (answers.get(answer) ?? 0) + 1);
}

function show(label: string, answers: Map<string, number>): void {
    const entries = [...answers];
    for (const [answer, n] of entries.slice(0, 3)) console.log(`${label}${answer} (${n} run${n === 1 ? "" : "s"})`);
    if (entries.length > 3) console.log(`${label}... and ${entries.length - 3} more different answers`);
}

const input: Input = JSON.parse(readFileSync(0, "utf8"));
const random = seededRandom(input.seed);
const rankings = new Map<string, number>();
const trialEnds = new Map<string, Map<string, number>>();
for (let run = 0; run < input.runs; run++) {
    const start = input.starts[run % input.starts.length];
    const fixedTime = Date.parse(start);
    const cohort = startCohort(() => fixedTime);
    for (const a of shuffled(input.awards, random)) cohort.award(a.learner, a.points);
    tally(rankings, cohort.ranking().join(", ") || "(nobody)");
    if (!trialEnds.has(start)) trialEnds.set(start, new Map());
    tally(trialEnds.get(start)!, cohort.trialEndsAt());
}
console.log(`${input.runs} runs, seed ${input.seed}`);
show("ranking: ", rankings);
for (const [start, answers] of trialEnds) show(`started ${start}: trial ends `, answers);
