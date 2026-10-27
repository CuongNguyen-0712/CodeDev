import { describe, expect, it } from "vitest";

import { completionByTier, contentKpiService, ratio } from "@/services/contentKpi.service";

describe("content KPI helpers", () => {
    it("ratio rounds to 3 decimals and is null without a denominator", () => {
        expect(ratio(2, 3)).toBe(0.667);
        expect(ratio(0, 4)).toBe(0);
        expect(ratio(0, 0)).toBeNull();
    });

    it("completionByTier merges expert and master into tier 4 and keeps empty tiers", () => {
        const tiers = completionByTier([
            { level: "beginner", courses: 2, enrolled: 10, completed: 4 },
            { level: "expert", courses: 1, enrolled: 3, completed: 1 },
            { level: "master", courses: 1, enrolled: 1, completed: 1 },
            { level: null, courses: 1, enrolled: 9, completed: 9 },
        ]);
        expect(tiers.map((t) => t.tier)).toEqual([1, 2, 3, 4]);
        expect(tiers[0]).toMatchObject({ courses: 2, enrolled: 10, completed: 4, completionRate: 0.4 });
        expect(tiers[1]).toMatchObject({ courses: 0, enrolled: 0, completionRate: null });
        expect(tiers[3]).toMatchObject({ courses: 2, enrolled: 4, completed: 2, completionRate: 0.5 });
    });
});

const hasDb = Boolean(process.env.DATABASE_URL);

// Read-only: runs the KPI queries against whatever the database holds and checks invariants.
describe.skipIf(!hasDb)("content KPIs (PostgreSQL)", () => {
    it("returns consistent per-challenge, statement and completion figures for a course", async () => {
        const { sql } = await import("@/lib/db");
        const { rows } = await sql(
            `SELECT c.public_id FROM catalog.course c
             WHERE EXISTS (SELECT 1 FROM challenge.challenges ch WHERE ch.course_id = c.id AND ch.is_published AND NOT ch.is_deleted)
             ORDER BY (SELECT COUNT(*) FROM learning.register r WHERE r.course_id = c.id) DESC, c.id LIMIT 1`
        );
        if (!rows[0]) return;

        const kpis = await contentKpiService.getCourseKpis(rows[0].public_id);
        expect(kpis.course.id).toBe(rows[0].public_id);
        expect(kpis.challenges.length).toBeGreaterThan(0);
        for (const c of kpis.challenges) {
            expect(["quiz", "mini_coding", "fix_bug"]).toContain(c.type);
            expect(c.passed).toBeLessThanOrEqual(c.tried);
            expect(c.hintLevel3Users).toBeLessThanOrEqual(c.hintUsers);
            if (c.passed > 0) expect(c.avgAttemptsToPass).toBeGreaterThanOrEqual(1);
            else expect(c.avgAttemptsToPass).toBeNull();
        }
        for (const s of kpis.hardStatements) {
            expect(s.answered).toBeGreaterThanOrEqual(kpis.thresholds.minAnswered);
            expect(s.wrongRate).toBeGreaterThan(kpis.thresholds.wrongRatio);
        }
        expect(kpis.completion.completed).toBeLessThanOrEqual(kpis.completion.enrolled);
        expect(kpis.tiers).toHaveLength(4);
    });

    it("404s for an unknown course", async () => {
        await expect(contentKpiService.getCourseKpis("no-such-course-kpi-test")).rejects.toMatchObject({ status: 404 });
    });
});
