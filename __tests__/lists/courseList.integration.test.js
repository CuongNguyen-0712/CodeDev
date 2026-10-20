import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Runs the list queries against the real PostgreSQL in DATABASE_URL: the filter values offered by
 * the UI must exist in the database enums, every filter combination must be valid SQL, and repeated
 * queries must be served from the cache. Read-only.
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("course / learning lists (PostgreSQL)", () => {
    let sql, courseDb, courseService, userService, redis, lists;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ courseDb } = await import("@/db/course.db"));
        ({ courseService } = await import("@/services/course.service"));
        ({ userService } = await import("@/services/user.service"));
        ({ redis } = await import("@/lib/cache"));
        lists = await import("@/lib/listFilters");
    });

    afterAll(() => vi.restoreAllMocks());

    const enumValues = async (type) => (await sql(
        `SELECT e.enumlabel AS v FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid WHERE t.typname = $1 ORDER BY e.enumsortorder`,
        [type]
    )).rows.map((r) => r.v);

    it("offers exactly the values of level_enum and status_course_enum", async () => {
        expect(lists.LEVELS).toEqual(await enumValues("level_enum"));
        expect(lists.COURSE_STATUSES).toEqual(await enumValues("status_course_enum"));
    });

    it("accepts every filter value at once and applies them as the database defines them", async () => {
        const all = {
            level: lists.LEVELS, price: ["free"], rating: ["1"],
            language: ["1", "2", "3"], category: ["1", "2"],
        };
        const result = await courseService.loadList({ search: "a", filter: all, limit: 5 });
        expect(Array.isArray(result.data)).toBe(true);

        const everything = await courseService.loadList({ filter: {}, limit: 50 });
        expect(everything.data.length).toBeGreaterThan(0);

        for (const course of everything.data) {
            const minRating = Number(course.rating);
            const byRating = await courseService.loadList({ filter: { rating: [String(minRating)] }, limit: 50 });
            expect(byRating.data.every((c) => Number(c.rating) >= minRating)).toBe(true);
            expect(byRating.data.map((c) => c.id)).toContain(course.id);

            // The price filter follows access_model (prices live in commerce.offer, cost is deprecated).
            const price = course.access_model === "premium" ? "paid" : "free";
            const other = price === "free" ? "paid" : "free";
            const filter = { level: [course.level], price: [price], language: [String(course.language_id)], category: [String(course.category_id)] };
            expect((await courseService.loadList({ filter, limit: 50 })).data.map((c) => c.id)).toContain(course.id);
            expect((await courseService.loadList({ filter: { ...filter, price: [other] }, limit: 50 })).data.map((c) => c.id)).not.toContain(course.id);
        }
    });

    it("matches LIKE wildcards literally", async () => {
        const all = await courseService.loadList({ filter: {}, limit: 50 });
        const wildcard = await courseService.loadList({ search: "%", filter: {}, limit: 50 });
        const withPercent = all.data.filter((c) => c.title.includes("%") || c.instructor?.includes("%"));
        expect(wildcard.data).toHaveLength(withPercent.length);
    });

    it("serves a repeated search from the cache (case-insensitive)", async () => {
        const spy = vi.spyOn(courseDb, "getCourseList");
        const unique = `vitest-${Date.now()}`;
        await courseService.getList({ search: unique, filter: { level: ["beginner"] } });
        await courseService.getList({ search: unique.toUpperCase(), filter: { level: ["beginner"] } });
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });

    it("returns filter options only for languages / categories that have courses", async () => {
        await redis.del("cache:course:filters");
        const options = await courseService.getFilterOptions();
        const visible = (await sql(`SELECT COUNT(*)::int AS n FROM catalog.course WHERE is_hidden = false AND is_deleted = false`)).rows[0].n;
        expect(options.languages.reduce((n, l) => n + l.courses, 0)).toBe(visible);
        expect(options.categories.reduce((n, c) => n + c.courses, 0)).toBe(visible);
    });

    it("runs the My learning query with every status and level", async () => {
        const user = (await sql(`SELECT u.public_id FROM learning.register r JOIN identity.users u ON u.id = r.user_id LIMIT 1`)).rows[0];
        expect(user).toBeTruthy();
        const result = await userService.loadCourseProgress({ userId: user.public_id, search: "", levels: lists.LEVELS, statuses: lists.COURSE_STATUSES, nextCursor: null });
        expect(result.data.length).toBeGreaterThan(0);
        const wildcard = await userService.loadCourseProgress({ userId: user.public_id, search: "%", levels: [], statuses: [], nextCursor: null });
        expect(wildcard.data.every((c) => c.title.includes("%"))).toBe(true);
    });
});
