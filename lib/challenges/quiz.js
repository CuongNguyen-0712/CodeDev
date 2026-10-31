/**
 * Quiz grading and the views the browser gets (pure: no database, no cache). The answer key rows
 * come from challengeDb.getQuizAnswerKey; services/challenge.service.js loads and stores them.
 */
export const QUIZ_PASS_RATIO = 0.7;
export const MAX_QUIZ_ATTEMPTS = 3;
export const QUIZ_COOLDOWN_SECONDS = 60;

export function normaliseAnswer(question, raw) {
    const valid = new Set((question.all_options || []).map(String));

    let selected = [];
    if (question.question_type === "multiple_choice") {
        selected = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
    } else if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
        selected = [String(raw)];
    }

    // Ignore option ids that do not belong to this question.
    return selected.filter((optId) => valid.has(optId));
}

export function gradeQuiz(questions, answers) {
    let earnedPoints = 0;
    let totalPoints = 0;
    const results = {};
    const rows = [];

    for (const q of questions) {
        const qId = q.question_id;
        const points = Number(q.points) || 0;
        const correct = (q.correct_options || []).map(String);
        const selected = normaliseAnswer(q, answers?.[qId]);

        totalPoints += points;

        let isCorrect = false;
        if (q.question_type === "single_choice") {
            isCorrect = selected.length === 1 && correct.includes(selected[0]);
        } else if (q.question_type === "multiple_choice") {
            isCorrect = selected.length === correct.length && selected.every((optId) => correct.includes(optId));
        }

        if (isCorrect) earnedPoints += points;

        for (const optionId of selected) {
            rows.push({ questionId: qId, optionId, isCorrect });
        }

        results[qId] = {
            isCorrect,
            selected,
            explanation: q.explanation,
            correctOptionIds: correct,
        };
    }

    const ratio = totalPoints > 0 ? earnedPoints / totalPoints : 0;

    return {
        earnedPoints,
        totalPoints,
        percentage: Math.round(ratio * 100),
        passed: totalPoints > 0 && ratio >= QUIZ_PASS_RATIO,
        results,
        rows,
    };
}

/**
 * What the browser may see of a graded quiz. The correct options (and explanations) are only
 * revealed once the quiz is passed; otherwise each question just says whether it was right.
 */
export function quizView(graded) {
    const results = Object.fromEntries(Object.entries(graded.results).map(([qId, r]) => [qId, {
        isCorrect: r.isCorrect,
        selected: r.selected,
        explanation: graded.passed ? r.explanation : null,
        correctOptionIds: graded.passed ? r.correctOptionIds : [],
    }]));

    return {
        earnedPoints: graded.earnedPoints,
        totalPoints: graded.totalPoints,
        percentage: graded.percentage,
        passed: graded.passed,
        results,
    };
}

/**
 * Groups attempt rows into graded attempts and derives the learner's quiz status.
 * `rows`: getQuizAttempts output (question_id, option_id, attempt_no, wait_seconds).
 */
export function evaluateQuizHistory(questions, rows) {
    const byAttempt = new Map();
    for (const row of rows) {
        if (!byAttempt.has(row.attempt_no)) byAttempt.set(row.attempt_no, { attemptNo: row.attempt_no, submittedAt: row.created_at, chosen: [] });
        byAttempt.get(row.attempt_no).chosen.push(row);
    }

    const attempts = [...byAttempt.values()].map((attempt) => {
        const answers = {};
        for (const q of questions) {
            const chosen = attempt.chosen.filter((r) => r.question_id === q.question_id).map((r) => r.option_id);
            if (chosen.length === 0) continue;
            answers[q.question_id] = q.question_type === "multiple_choice" ? chosen : chosen[0];
        }
        return { ...attempt, answers, graded: gradeQuiz(questions, answers) };
    });

    const passedAttempt = attempts.find((a) => a.graded.passed) || null;
    const latest = attempts[attempts.length - 1] || null;
    const waitSeconds = Number(rows[0]?.wait_seconds) || 0;

    return { attempts, passedAttempt, latest, waitSeconds };
}

/** The learner's questions without answers: no correct options, no explanations. */
export const quizQuestionsView = (questions) => questions.map((q) => ({
    id: q.question_id,
    content: q.content,
    type: q.question_type,
    points: Number(q.points) || 0,
    options: q.options || [],
}));

export function quizStateView(ctx, history, questions) {
    const attemptsUsed = history.attempts.length;
    const passed = Boolean(history.passedAttempt);
    const attemptsLeft = passed ? 0 : Math.max(0, MAX_QUIZ_ATTEMPTS - attemptsUsed);
    const waitSeconds = attemptsLeft > 0 ? history.waitSeconds : 0;
    // A passed quiz shows the passing attempt; otherwise the most recent one.
    const shown = history.passedAttempt || history.latest;

    return {
        challengeId: ctx.id,
        attempted: attemptsUsed > 0,
        attemptsUsed,
        maxAttempts: MAX_QUIZ_ATTEMPTS,
        attemptsLeft,
        cooldownSeconds: QUIZ_COOLDOWN_SECONDS,
        waitSeconds,
        nextAttemptAt: waitSeconds > 0 ? new Date(Date.now() + waitSeconds * 1000).toISOString() : null,
        canSubmit: !passed && attemptsLeft > 0 && waitSeconds === 0,
        submittedAt: shown?.submittedAt ?? null,
        answers: shown?.answers ?? null,
        ...(shown ? quizView(shown.graded) : { passed: false, results: {} }),
        passed,
        questions: quizQuestionsView(questions),
    };
}
