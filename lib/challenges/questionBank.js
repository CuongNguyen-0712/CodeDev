import { createHash } from "node:crypto";

/**
 * Question bank (challenge.challenges.quiz_display_count): each learner gets a fixed subset of
 * `count` questions in a fixed shuffled order, the same on every attempt. The order is
 * md5("<user db id>:<question id>") compared byte-wise, exactly like public.learning_progress_content
 * (ORDER BY md5(...) COLLATE "C"), so the questions shown are the questions graded.
 * `count` null/0 keeps every question in its authored order.
 */
export function pickQuestions(questions, { userDbId, count, idOf = (q) => q.question_id }) {
    const n = Number(count) || 0;
    if (n <= 0) return questions;
    const ranked = questions.map((q) => ({ q, rank: createHash("md5").update(`${userDbId}:${idOf(q)}`).digest("hex") }));
    ranked.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
    return ranked.slice(0, n).map((r) => r.q);
}
