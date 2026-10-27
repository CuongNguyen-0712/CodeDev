import { expAuditDb } from "@/db/expAudit.db";

/**
 * Daily EXP audit (V1.3 §7.3, §7.10; docs/master-plan-v1.3-adaptation.md P8). Reports only: it
 * never changes EXP or blocks anyone. Run by the cron route (GET|POST /api/internal/exp-audit) and
 * on demand from the admin "Content KPIs" tab (GET /api/admin/exp-audit).
 */

export const AUDIT_LIMITS = { rows: 100, baselineDays: 30, minSharedAccounts: 2 };

// question_submissions keeps one created_at per attempt and nothing about when the quiz was opened,
// so the time spent answering cannot be measured; reported instead of guessed.
const QUIZ_TIMING_NOTE =
    "Not available: quiz attempts store only their submit time (challenge.question_submissions.created_at), " +
    "not when the learner opened the quiz, so answer time cannot be measured. Recording the open time is needed first.";

/** One line for the logs: counts of every finding, `clean` when there is none. */
export function auditSummary(report) {
    const counts = {
        drift: report.reconciliation.total,
        dailyOutliers: report.anomalies.dailyExp.users.length,
        sharedSolutions: report.anomalies.sharedSolutions.length,
    };
    const flagged = Object.values(counts).some((n) => n > 0);
    return `${flagged ? "flagged" : "clean"} ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ")}`;
}

export async function runExpAudit() {
    const [drift, daily, shared] = await Promise.all([
        expAuditDb.listDrift({ limit: AUDIT_LIMITS.rows }),
        expAuditDb.listDailyOutliers({ baselineDays: AUDIT_LIMITS.baselineDays, limit: AUDIT_LIMITS.rows }),
        expAuditDb.listSharedSolutions({ minUsers: AUDIT_LIMITS.minSharedAccounts, limit: AUDIT_LIMITS.rows }),
    ]);
    const dailyRow = daily.rows[0] || { p99: null, samples: 0, users: [] };

    return {
        generatedAt: new Date().toISOString(),
        reconciliation: {
            total: drift.rows[0]?.total ?? 0,
            users: drift.rows.map((row) => ({
                userId: row.user_id,
                username: row.username,
                cachedExp: Number(row.cached_exp),
                ledgerExp: Number(row.ledger_exp),
                cachedLevel: row.cached_level,
                ledgerLevel: row.ledger_level,
            })),
        },
        anomalies: {
            dailyExp: {
                p99: dailyRow.p99,
                baselineDays: AUDIT_LIMITS.baselineDays,
                samples: dailyRow.samples,
                users: dailyRow.users.map((u) => ({ ...u, gained: Number(u.gained) })),
            },
            sharedSolutions: shared.rows.map((row) => ({
                challengeId: row.challenge_id,
                challengeTitle: row.challenge_title,
                courseId: row.course_id,
                codeHash: row.code_hash,
                accounts: row.accounts,
                usernames: row.usernames,
                lastSubmittedAt: row.last_submitted_at,
            })),
            fastQuizAnswers: { available: false, note: QUIZ_TIMING_NOTE },
        },
    };
}
