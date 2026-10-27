import { readFileSync } from "node:fs";

// Nightly reconciliation of the CodeDev read models. The source of truth is PostgreSQL: enrollments and
// progress. Two read models are built from events: the leaderboard (total XP per learner) and the issued
// certificates. Compare them, and produce the commands that make the read models match the source:
// missing, extra and wrong values; skip keys whose source changed less than graceSeconds ago (still in
// flight); apply at most maxFixes commands, chosen by a fixed priority; in a dry run, change nothing.
// The clock counts seconds. Do not change the types or the test runner.

type Enrollment = { userId: string; courseId: string; status: "active" | "cancelled"; updatedAt: number };
type Progress = { userId: string; courseId: string; completedLessons: number; totalLessons: number; xp: number; updatedAt: number };
type Certificate = { userId: string; courseId: string; issuedAt: number };
type Source = { enrollments: Enrollment[]; progress: Progress[] };
type ReadModel = {
    leaderboard: Map<string, number>; // userId -> xp
    certificates: Map<string, Certificate>; // "userId:courseId" -> certificate
};
type Options = { now: number; graceSeconds: number; maxFixes: number; dryRun: boolean };
type Command =
    | { op: "certificate.issue" | "certificate.revoke"; userId: string; courseId: string }
    | { op: "leaderboard.upsert"; userId: string; xp: number; was: number | null } // was null: the row is missing
    | { op: "leaderboard.delete"; userId: string; was: number };
type Report = { fixes: Command[]; skippedByCap: Command[]; deferred: Command[] } | { error: string };

// ---------------------------------------------------------------- your code
/** Compares the read models with the source and returns the commands; applies the fixes unless opts.dryRun. */
function reconcile(source: Source, model: ReadModel, opts: Options): Report {
    return { fixes: [], skippedByCap: [], deferred: [] };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { now, graceSeconds, maxFixes, dryRun, enrollments, progress, leaderboard: { userId: xp }, certificates: [...] }
type Input = Options & Source & { leaderboard: Record<string, number>; certificates: Certificate[] };
const input = JSON.parse(readFileSync(0, "utf8")) as Input;
const model: ReadModel = {
    leaderboard: new Map(Object.entries(input.leaderboard)),
    certificates: new Map(input.certificates.map((c) => [`${c.userId}:${c.courseId}`, { ...c }])),
};
const report = reconcile(
    { enrollments: input.enrollments, progress: input.progress },
    model,
    { now: input.now, graceSeconds: input.graceSeconds, maxFixes: input.maxFixes, dryRun: input.dryRun },
);
const show = (c: Command): string => {
    switch (c.op) {
        case "certificate.issue": return `certificate.issue ${c.userId} ${c.courseId} (missing)`;
        case "certificate.revoke": return `certificate.revoke ${c.userId} ${c.courseId} (extra)`;
        case "leaderboard.upsert": return c.was === null ? `leaderboard.upsert ${c.userId} xp=${c.xp} (missing)` : `leaderboard.upsert ${c.userId} xp=${c.xp} (wrong value, was ${c.was})`;
        case "leaderboard.delete": return `leaderboard.delete ${c.userId} (extra, was ${c.was})`;
    }
};
const byKey = <V>(m: Map<string, V>): [string, V][] => [...m.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
const out = "error" in report
    ? { error: report.error }
    : {
        mode: input.dryRun ? "dry-run" : "apply",
        fixes: report.fixes.map(show),
        skippedByCap: report.skippedByCap.map(show),
        deferred: report.deferred.map(show),
        summary: `${report.fixes.length} ${input.dryRun ? "planned" : "applied"}, ${report.skippedByCap.length} over the cap, ${report.deferred.length} in flight`,
    };
console.log(JSON.stringify({
    ...out,
    leaderboard: byKey(model.leaderboard).map(([u, xp]) => `${u} ${xp}`),
    certificates: byKey(model.certificates).map(([, c]) => `${c.userId} ${c.courseId} issuedAt=${c.issuedAt}`),
}, null, 2));
