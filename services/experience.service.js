import { experienceDb } from "@/db/experience.db";

export const experienceService = {
    /** Level table + one page of the caller's EXP history (`next` is the cursor of the following page). */
    getExperience: async ({ userId, before = null, limit = 20 }) => {
        const [levels, ledger] = await Promise.all([
            experienceDb.getLevels(),
            experienceDb.getTransactions({ userId, before, limit }),
        ]);
        const hasMore = ledger.rowCount > limit;
        const transactions = ledger.rows.slice(0, limit).map((row) => ({
            id: row.id,
            amount: Number(row.amount),
            expAfter: Number(row.exp_after),
            source: row.source_type,
            sourceTitle: row.source_title,
            rule: row.rule_key,
            reason: row.reason,
            createdAt: row.created_at,
        }));
        const last = transactions[transactions.length - 1];

        return {
            levels: levels.rows.map((row) => ({ level: row.level, title: row.title, minExp: Number(row.min_exp) })),
            transactions,
            next: hasMore && last ? { createdAt: last.createdAt, id: last.id } : null,
        };
    },
};
