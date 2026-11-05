import { createHash } from "node:crypto";

/**
 * Question bank (challenge.challenges.quiz_display_count): each learner gets a fixed subset of
 * `count` questions in a fixed shuffled order, the same on every attempt. The order is
 * md5("<user db id>:<question id>") compared byte-wise, exactly like public.learning_progress_content
 * (ORDER BY md5(...) COLLATE "C"), so the questions shown are the questions graded.
 * `count` null/0 keeps every question in its authored order.
 */
/**
 * Piece list of a piece-assembly challenge as one learner sees it: every piece, in a fixed
 * order per learner and challenge (so the list does not give the assembly order away), with
 * the `distractor` flag removed (it never reaches the browser).
 */
export function dealPieces(pieces, { userDbId, challengeId }) {
    if (!Array.isArray(pieces) || pieces.length === 0) return [];
    return pickQuestions(pieces, { userDbId, count: pieces.length, idOf: (p) => `${challengeId}:${p.id}` })
        .map(({ distractor: _distractor, ...piece }) => piece);
}

export function pickQuestions(questions, { userDbId, count, idOf = (q) => q.question_id }) {
    const n = Number(count) || 0;
    if (n <= 0) return questions;
    const ranked = questions.map((q) => ({ q, rank: createHash("md5").update(`${userDbId}:${idOf(q)}`).digest("hex") }));
    ranked.sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0));
    return ranked.slice(0, n).map((r) => r.q);
}
