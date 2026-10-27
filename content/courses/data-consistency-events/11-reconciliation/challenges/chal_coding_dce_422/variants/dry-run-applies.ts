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
const RANK = { "certificate.issue": 0, "certificate.revoke": 1, missing: 2, wrong: 3, "leaderboard.delete": 4 };

function rank(c: Command): number {
    if (c.op === "leaderboard.upsert") return c.was === null ? RANK.missing : RANK.wrong;
    return RANK[c.op];
}

function compareCommands(a: Command, b: Command): number {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.op === "leaderboard.upsert" && b.op === "leaderboard.upsert" && a.was !== null && b.was !== null) {
        const d = Math.abs(b.xp - b.was) - Math.abs(a.xp - a.was); // larger difference first
        if (d !== 0) return d;
    }
    const ka = [a.userId, "courseId" in a ? a.courseId : ""];
    const kb = [b.userId, "courseId" in b ? b.courseId : ""];
    for (let i = 0; i < 2; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
    return 0;
}

function reconcile(source: Source, model: ReadModel, opts: Options): Report {
    const okInt = (n: number) => Number.isInteger(n) && n >= 0;
    if (!okInt(opts.graceSeconds) || !okInt(opts.maxFixes)) return { error: "invalid options" };

    // Expected state from the source of truth.
    const progressByKey = new Map(source.progress.map((p) => [`${p.userId}:${p.courseId}`, p]));
    const expectedXp = new Map<string, number>();
    const expectedCerts = new Set<string>();
    for (const e of source.enrollments) {
        if (e.status !== "active") continue;
        const key = `${e.userId}:${e.courseId}`;
        const p = progressByKey.get(key);
        expectedXp.set(e.userId, (expectedXp.get(e.userId) ?? 0) + (p?.xp ?? 0));
        if (p && p.totalLessons > 0 && p.completedLessons >= p.totalLessons) expectedCerts.add(key);
    }

    // Last source change per learner and per enrollment key, for the grace period.
    const lastByUser = new Map<string, number>();
    const lastByKey = new Map<string, number>();
    for (const row of [...source.enrollments, ...source.progress]) {
        const key = `${row.userId}:${row.courseId}`;
        lastByUser.set(row.userId, Math.max(lastByUser.get(row.userId) ?? -Infinity, row.updatedAt));
        lastByKey.set(key, Math.max(lastByKey.get(key) ?? -Infinity, row.updatedAt));
    }
    const inFlight = (last: number | undefined) => last !== undefined && opts.now - last < opts.graceSeconds;

    const candidates: { cmd: Command; flying: boolean }[] = [];
    for (const key of expectedCerts) {
        if (model.certificates.has(key)) continue;
        const [userId, courseId] = key.split(":");
        candidates.push({ cmd: { op: "certificate.issue", userId, courseId }, flying: inFlight(lastByKey.get(key)) });
    }
    for (const [key, c] of model.certificates) {
        if (expectedCerts.has(key)) continue;
        candidates.push({ cmd: { op: "certificate.revoke", userId: c.userId, courseId: c.courseId }, flying: inFlight(lastByKey.get(key)) });
    }
    for (const [userId, xp] of expectedXp) {
        const was = model.leaderboard.get(userId);
        if (was === xp) continue;
        candidates.push({ cmd: { op: "leaderboard.upsert", userId, xp, was: was ?? null }, flying: inFlight(lastByUser.get(userId)) });
    }
    for (const [userId, was] of model.leaderboard) {
        if (expectedXp.has(userId)) continue;
        candidates.push({ cmd: { op: "leaderboard.delete", userId, was }, flying: inFlight(lastByUser.get(userId)) });
    }

    const ready = candidates.filter((c) => !c.flying).map((c) => c.cmd).sort(compareCommands);
    const deferred = candidates.filter((c) => c.flying).map((c) => c.cmd).sort(compareCommands);
    const fixes = ready.slice(0, opts.maxFixes);
    const skippedByCap = ready.slice(opts.maxFixes);

    if (opts.dryRun || !opts.dryRun) {
        for (const c of fixes) {
            if (c.op === "certificate.issue") model.certificates.set(`${c.userId}:${c.courseId}`, { userId: c.userId, courseId: c.courseId, issuedAt: opts.now });
            else if (c.op === "certificate.revoke") model.certificates.delete(`${c.userId}:${c.courseId}`);
            else if (c.op === "leaderboard.upsert") model.leaderboard.set(c.userId, c.xp);
            else model.leaderboard.delete(c.userId);
        }
    }
    return { fixes, skippedByCap, deferred };
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
