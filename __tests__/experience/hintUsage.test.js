import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { summarizeHintUsage } from "@/lib/hintUsage";

const row = (id, maxLevel, passedAt, extra = {}) => ({
    challenge_id: String(id),
    title: `Challenge ${id}`,
    type: "mini_coding",
    lesson_id: "7",
    lesson_title: "Lesson",
    course_id: "course-pub",
    passed_at: passedAt,
    hints_opened: maxLevel,
    max_hint_level: maxLevel,
    ...extra,
});

describe("summarizeHintUsage", () => {
    it("is all zeros with no passes", () => {
        expect(summarizeHintUsage([])).toEqual({
            passed: 0, noHint: 0, light: 0, assisted: 0, averageHints: 0, recentAssisted: [],
        });
        expect(summarizeHintUsage()).toMatchObject({ passed: 0, averageHints: 0 });
    });

    it("buckets passes by the deepest hint opened before the pass", () => {
        const s = summarizeHintUsage([
            row(1, 0, "2026-10-01T00:00:00Z"),
            row(2, 0, "2026-10-02T00:00:00Z"),
            row(3, 1, "2026-10-03T00:00:00Z"),
            row(4, 2, "2026-10-04T00:00:00Z"),
            row(5, 3, "2026-10-05T00:00:00Z"),
        ]);
        expect(s).toMatchObject({ passed: 5, noHint: 2, light: 2, assisted: 1 });
        expect(s.noHint + s.light + s.assisted).toBe(s.passed);
        // (0 + 0 + 1 + 2 + 3) / 5
        expect(s.averageHints).toBe(1.2);
    });

    it("rounds the average to one decimal and accepts string counts from pg", () => {
        const s = summarizeHintUsage([
            row(1, "1", "2026-10-01T00:00:00Z"),
            row(2, "0", "2026-10-02T00:00:00Z"),
            row(3, "0", "2026-10-03T00:00:00Z"),
        ]);
        expect(s.averageHints).toBe(0.3);
        expect(s.light).toBe(1);
    });

    it("lists the newest assisted passes first, capped, with a link to the challenge in its lesson", () => {
        const rows = [1, 2, 3, 4, 5, 6, 7].map((id) => row(id, 3, `2026-10-0${id}T00:00:00Z`));
        rows.push(row(8, 2, "2026-10-09T00:00:00Z"));
        const s = summarizeHintUsage(rows, { recentLimit: 3 });
        expect(s.assisted).toBe(7);
        expect(s.recentAssisted.map((r) => r.challengeId)).toEqual(["7", "6", "5"]);
        expect(s.recentAssisted[0]).toEqual({
            challengeId: "7",
            title: "Challenge 7",
            type: "mini_coding",
            lessonTitle: "Lesson",
            href: "/learning/course-pub?lesson=7#challenge-7",
            passedAt: "2026-10-07T00:00:00Z",
        });
    });
});

/**
 * Read-only: runs experienceDb.getHintUsage against the local database (DATABASE_URL) for users who
 * passed coding challenges and recounts each row with a plain per-challenge query.
 */
describe.skipIf(!process.env.DATABASE_URL)("experienceDb.getHintUsage (PostgreSQL, read-only)", () => {
    let sql, dbPool, experienceDb;

    beforeAll(async () => {
        ({ sql, dbPool } = await import("@/lib/db"));
        ({ experienceDb } = await import("@/db/experience.db"));
    });

    afterAll(async () => {
        await dbPool?.end?.();
    });

    it("returns one row per passed coding challenge with hints counted before the first pass", async () => {
        const { rows: users } = await sql(
            `SELECT u.public_id, u.id::text AS id
             FROM identity.users u
             WHERE EXISTS (SELECT 1 FROM challenge.code_submissions s WHERE s.user_id = u.id AND s.status = 'passed')
             ORDER BY (SELECT COUNT(*) FROM challenge.hint_views hv WHERE hv.user_id = u.id) DESC
             LIMIT 3`
        );
        // A user without passes still gets a valid (empty) result.
        const none = await experienceDb.getHintUsage({ userId: "__no_such_user__" });
        expect(none.rows).toEqual([]);

        for (const user of users) {
            const { rows } = await experienceDb.getHintUsage({ userId: user.public_id });
            const ids = rows.map((r) => r.challenge_id);
            expect(new Set(ids).size).toBe(ids.length);

            for (const r of rows) {
                expect(r.max_hint_level).toBeGreaterThanOrEqual(0);
                expect(r.max_hint_level).toBeLessThanOrEqual(3);
                expect(r.hints_opened).toBeLessThanOrEqual(3);
                const { rows: [check] } = await sql(
                    `SELECT COUNT(*)::int AS n, COALESCE(MAX(hv.level), 0)::int AS max
                     FROM challenge.hint_views hv
                     WHERE hv.user_id = $1::bigint AND hv.challenge_id = $2::bigint
                       AND hv.opened_at < (SELECT MIN(submitted_at) FROM challenge.code_submissions
                                           WHERE user_id = $1::bigint AND challenge_id = $2::bigint AND status = 'passed')`,
                    [user.id, r.challenge_id]
                );
                expect([r.hints_opened, r.max_hint_level]).toEqual([check.n, check.max]);
            }

            const summary = summarizeHintUsage(rows);
            expect(summary.noHint + summary.light + summary.assisted).toBe(rows.length);
        }
    });
});
