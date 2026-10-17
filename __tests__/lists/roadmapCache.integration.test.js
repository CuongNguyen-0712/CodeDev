import { beforeAll, describe, expect, it, vi } from "vitest";

/** Roadmap details caching against the real PostgreSQL in DATABASE_URL. Read-only. */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("roadmap details cache (PostgreSQL)", () => {
    let sql, roadmapDb, roadmapService, redis;

    beforeAll(async () => {
        ({ sql } = await import("@/lib/db"));
        ({ roadmapDb } = await import("@/db/roadmap"));
        ({ roadmapService } = await import("@/services/roadmap.service"));
        ({ redis } = await import("@/lib/cache"));
    });

    it("rejects ids that are not uuids before touching the database", async () => {
        const spy = vi.spyOn(roadmapDb, "getDetails");
        await expect(roadmapService.getDetails({ publicId: "not-a-roadmap" })).rejects.toMatchObject({ status: 404 });
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });

    it("serves guests from one shared entry", async () => {
        const row = (await sql(`SELECT public_id::text AS id FROM roadmap.roadmaps ORDER BY id LIMIT 1`)).rows[0];
        expect(row).toBeTruthy();
        await redis.del(`cache:roadmap:${row.id}:details`);

        const spy = vi.spyOn(roadmapDb, "getDetails");
        const first = await roadmapService.getDetails({ publicId: row.id });
        const second = await roadmapService.getDetails({ publicId: row.id });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(second.title).toBe(first.title);
        spy.mockRestore();
    });

    it("keeps a signed-in visitor's view separate and versioned", async () => {
        const row = (await sql(`SELECT public_id::text AS id FROM roadmap.roadmaps ORDER BY id LIMIT 1`)).rows[0];
        const user = (await sql(`SELECT public_id FROM identity.users ORDER BY id LIMIT 1`)).rows[0];
        const { invalidateUserCache } = await import("@/lib/cacheKeys");

        await invalidateUserCache(user.public_id);
        const spy = vi.spyOn(roadmapDb, "getDetails");
        await roadmapService.getDetails({ publicId: row.id, userId: user.public_id });
        await roadmapService.getDetails({ publicId: row.id, userId: user.public_id });
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith(row.id, user.public_id);

        await invalidateUserCache(user.public_id);
        await roadmapService.getDetails({ publicId: row.id, userId: user.public_id });
        expect(spy).toHaveBeenCalledTimes(2);
        spy.mockRestore();
    });
});
