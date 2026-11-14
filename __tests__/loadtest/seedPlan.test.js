import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { seedPlan } from "@/scripts/loadtest/seedPlan.mjs";
import { assertSafeTarget, isLocalLoadtest } from "@/scripts/loadtest/target.mjs";

it("plans deterministic, well-formed users", () => {
    const a = seedPlan({ users: 50, courseIds: ["c1", "c2", "c3", "c4"], seed: 7 });
    expect(a).toEqual(seedPlan({ users: 50, courseIds: ["c1", "c2", "c3", "c4"], seed: 7 }));
    expect(a.users[0].username).toBe("lt_00001");
    expect(a.users[49].email).toBe("lt_00050@loadtest.codedev.test");
    for (const u of a.users) {
        expect(u.courses).toHaveLength(3);
        expect(new Set(u.courses).size).toBe(3);
        expect(u.friends).not.toContain(u.index);
        expect(u.pending.some((p) => u.friends.includes(p))).toBe(false);
    }
});

it("makes each friendship once per pair", () => {
    const { users } = seedPlan({ users: 200, courseIds: ["c1", "c2", "c3"], seed: 1 });
    const pairs = users.flatMap((u) => [...u.friends, ...u.pending].map((f) => [Math.min(u.index, f), Math.max(u.index, f)].join("-")));
    expect(new Set(pairs).size).toBe(pairs.length);
});

it("refuses dev and production databases, each for its own reason", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "loadtest-target-"));
    try {
        fs.writeFileSync(path.join(root, ".env.production"), "DATABASE_URL=postgres://u:p@ep-prod-1.neon.tech/neondb\n");
        fs.writeFileSync(path.join(root, ".env.local"), "DATABASE_URL=postgres://u:p@localhost:5432/codedev\n");
        const refuse = (url, confirmed, re) => expect(() => assertSafeTarget(url, { root, confirmed })).toThrow(re);
        refuse("postgres://x:y@ep-prod-1.neon.tech/neondb", true, /DATABASE_URL of \.env\.production/);
        refuse("postgres://x:y@ep-prod-1-pooler.neon.tech/neondb", true, /DATABASE_URL of \.env\.production/);
        refuse("postgres://x:y@localhost:5432/codedev", true, /DATABASE_URL of \.env\.local/);
        refuse("postgres://x@localhost:5434/codedev2", true, /does not start with loadtest/);
        refuse("postgres://u:p@ep-other.neon.tech/neondb", false, /--yes/);
        expect(() => assertSafeTarget("postgres://u:p@ep-other.neon.tech/neondb", { root, confirmed: true })).not.toThrow();
        expect(() => assertSafeTarget("postgres://u:p@localhost:5433/loadtest_base", { root })).not.toThrow();
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
});

it("bootstraps data only on a local loadtest database", () => {
    expect(isLocalLoadtest("postgres://u:p@localhost:5435/loadtest_base")).toBe(true);
    expect(isLocalLoadtest("postgres://u:p@postgres-load:5432/loadtest_run")).toBe(true);
    expect(isLocalLoadtest("postgres://u:p@localhost:5432/codedev")).toBe(false);
    expect(isLocalLoadtest("postgres://u:p@ep-x.neon.tech/loadtest_base")).toBe(false);
});
