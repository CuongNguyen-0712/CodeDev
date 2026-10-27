/**
 * Hint self-assessment (V1.3 §8): how the learner's passed coding challenges split by the deepest
 * hint opened before the first pass. Hint 3 before the pass is the "assisted" case (half EXP).
 *
 * `rows` come from experienceDb.getHintUsage: one per passed coding challenge, with
 * `hints_opened` / `max_hint_level` counting only hints opened before the first pass.
 */
export function summarizeHintUsage(rows = [], { recentLimit = 5 } = {}) {
    let noHint = 0;
    let light = 0;
    let assisted = 0;
    let hintsOpened = 0;
    const assistedRows = [];

    for (const row of rows) {
        const level = Number(row.max_hint_level) || 0;
        hintsOpened += Number(row.hints_opened) || 0;
        if (level >= 3) {
            assisted += 1;
            assistedRows.push(row);
        } else if (level > 0) {
            light += 1;
        } else {
            noHint += 1;
        }
    }

    const passed = rows.length;
    const recentAssisted = assistedRows
        .sort((a, b) => new Date(b.passed_at) - new Date(a.passed_at))
        .slice(0, recentLimit)
        .map((row) => ({
            challengeId: String(row.challenge_id),
            title: row.title,
            type: row.type,
            lessonTitle: row.lesson_title,
            href: `/learning/${row.course_id}?lesson=${row.lesson_id}#challenge-${row.challenge_id}`,
            passedAt: row.passed_at,
        }));

    return {
        passed,
        noHint,
        light,
        assisted,
        averageHints: passed ? Math.round((hintsOpened / passed) * 10) / 10 : 0,
        recentAssisted,
    };
}
