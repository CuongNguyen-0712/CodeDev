import { expect, it } from "vitest";
import { seedPlan } from "@/scripts/loadtest/seedPlan.mjs";
import { assertSafeTarget } from "@/scripts/loadtest/target.mjs";

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

it("refuses dev and production databases", () => {
    const root = process.cwd();
    expect(() => assertSafeTarget("postgres://x@localhost:5432/codedev", { root, confirmed: true })).toThrow(/loadtest/);
    expect(() => assertSafeTarget("postgres://u:p@ep-x.neon.tech/neondb", { root, confirmed: false })).toThrow(/--yes/);
    expect(() => assertSafeTarget("postgres://u:p@localhost:5433/loadtest_base", { root, confirmed: false })).not.toThrow();
});
