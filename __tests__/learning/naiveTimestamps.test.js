// `timestamp without time zone` columns (comment.created_at and ~80 others) hold UTC: lib/db.js runs
// sessions in UTC and reads naive values as UTC, so the time is right whatever zone Node runs in.
import { describe, expect, it } from "vitest";

import { parseUtcTimestamp } from "@/lib/db";

describe("parseUtcTimestamp", () => {
    it("reads PostgreSQL's naive text as UTC and leaves other values alone", () => {
        expect(parseUtcTimestamp("2026-11-02 19:26:27.848").toISOString()).toBe("2026-11-02T19:26:27.848Z");
        expect(parseUtcTimestamp("2026-11-02 19:26:27").toISOString()).toBe("2026-11-02T19:26:27.000Z");
        expect(parseUtcTimestamp("infinity")).toBe("infinity");
    });
});

describe.skipIf(!process.env.DATABASE_URL)("naive timestamps through lib/db (PostgreSQL)", () => {
    it("returns a fresh now() as the current instant, not shifted by a time zone", async () => {
        const { sql } = await import("@/lib/db");
        const { rows } = await sql(`SELECT now()::timestamp AS naive, current_setting('TimeZone') AS zone`);
        expect(Math.abs(rows[0].naive.getTime() - Date.now())).toBeLessThan(10_000);
    });

    it("stores a JS Date parameter as UTC in a naive column", async () => {
        const { sql } = await import("@/lib/db");
        const instant = new Date("2026-11-03T03:30:00.000Z");
        const { rows } = await sql(`SELECT $1::timestamp AS naive, $1::timestamp::text AS text`, [instant]);
        expect(rows[0].text).toBe("2026-11-03 03:30:00");
        expect(rows[0].naive.toISOString()).toBe(instant.toISOString());
    });
});
