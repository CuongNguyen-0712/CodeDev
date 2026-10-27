import { describe, expect, it } from "vitest";

import { normalizedCodeHash } from "@/lib/challenges/codeHash";
import { auditSummary, runExpAudit } from "@/services/expAudit.service";

describe("normalizedCodeHash", () => {
    it("ignores whitespace, indentation and line endings but not code changes", () => {
        const a = "function add(a, b) {\n    return a + b;\n}\n";
        const b = "function add(a,b){\r\n\treturn a+b;\r\n}";
        expect(normalizedCodeHash(a)).toBe(normalizedCodeHash(b));
        expect(normalizedCodeHash(a)).not.toBe(normalizedCodeHash(a.replace("a + b", "b + a")));
        expect(normalizedCodeHash(null)).toMatch(/^[0-9a-f]{64}$/);
    });
});

describe("auditSummary", () => {
    const report = (drift, daily, shared) => ({
        reconciliation: { total: drift },
        anomalies: { dailyExp: { users: Array(daily).fill({}) }, sharedSolutions: Array(shared).fill({}) },
    });

    it("is clean only when nothing is flagged", () => {
        expect(auditSummary(report(0, 0, 0))).toBe("clean drift=0 dailyOutliers=0 sharedSolutions=0");
        expect(auditSummary(report(0, 2, 1))).toBe("flagged drift=0 dailyOutliers=2 sharedSolutions=1");
    });
});

const hasDb = Boolean(process.env.DATABASE_URL);

// Read-only: the audit only SELECTs; checks the report against the ledger it reads.
describe.skipIf(!hasDb)("EXP audit (PostgreSQL)", () => {
    it("reports drift exactly like the ledger and never changes EXP", async () => {
        const { sql } = await import("@/lib/db");
        const before = (await sql(`SELECT COALESCE(SUM(exp), 0)::text AS exp, (SELECT COUNT(*) FROM profile.exp_transaction)::text AS tx FROM profile.info`)).rows[0];

        const report = await runExpAudit();

        const drift = (await sql(
            `SELECT COUNT(*)::int AS n FROM profile.info i
             LEFT JOIN (SELECT user_id, GREATEST(0, SUM(amount)) AS e FROM profile.exp_transaction GROUP BY user_id) l ON l.user_id = i.user_id
             WHERE i.exp IS DISTINCT FROM COALESCE(l.e, 0) OR i.exp_level IS DISTINCT FROM public.level_for_exp(COALESCE(l.e, 0)::bigint)`
        )).rows[0].n;
        expect(report.reconciliation.total).toBe(drift);
        for (const u of report.reconciliation.users) {
            expect(u.cachedExp !== u.ledgerExp || u.cachedLevel !== u.ledgerLevel).toBe(true);
        }

        const { dailyExp, sharedSolutions, fastQuizAnswers } = report.anomalies;
        for (const u of dailyExp.users) expect(u.gained).toBeGreaterThan(dailyExp.p99);
        if (dailyExp.samples === 0) expect(dailyExp.users).toEqual([]);
        for (const s of sharedSolutions) expect(s.accounts).toBeGreaterThanOrEqual(2);
        expect(fastQuizAnswers.available).toBe(false);

        const after = (await sql(`SELECT COALESCE(SUM(exp), 0)::text AS exp, (SELECT COUNT(*) FROM profile.exp_transaction)::text AS tx FROM profile.info`)).rows[0];
        expect(after).toEqual(before);
    });
});
