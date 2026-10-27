import crypto from "crypto";
import { ulid } from "ulid";

import { challengeDb } from "@/db/challenge.db";
import { s3, bucketForKey } from "@/lib/s3";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL, invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { ApiError } from "@/lib/error/apiError";
import { outputsMatch, parseJsonSafe, stdoutMatches, stdoutValue, toJsonValue } from "@/lib/challenges/compare";
import { executeTests, serverExecutionEnabled } from "@/lib/challenges/codeRunner";
import { detectEntryName } from "@/lib/challenges/entry";
import { pickQuestions } from "@/lib/challenges/questionBank";

export const QUIZ_PASS_RATIO = 0.7;
export const MAX_SOURCE_BYTES = 64 * 1024;
export const MAX_QUIZ_ATTEMPTS = 3;
export const QUIZ_COOLDOWN_SECONDS = 5 * 60;
export const MAX_CODING_ATTEMPTS = 5;

// A started submission must be finished (hidden tests reported) within this window.
const PENDING_SUBMISSION_TTL_SEC = 15 * 60;

const CODING_TYPES = new Set(["fix_bug", "mini_coding"]);

const LANGUAGE_FILES = {
    javascript: { ext: "js", mime: "application/javascript" },
    typescript: { ext: "ts", mime: "application/typescript" },
    python: { ext: "py", mime: "text/x-python" },
    c: { ext: "c", mime: "text/x-c" },
    cpp: { ext: "cpp", mime: "text/x-c++src" },
    java: { ext: "java", mime: "text/x-java" },
    go: { ext: "go", mime: "text/x-go" },
    rust: { ext: "rs", mime: "text/x-rust" },
    php: { ext: "php", mime: "text/x-php" },
    kotlin: { ext: "kt", mime: "text/x-kotlin" },
    csharp: { ext: "cs", mime: "text/x-csharp" },
};

function codeRunnerRequired() {
    return new ApiError("Running this language needs the code runner, which is not available right now. Try again later; no attempt was used.", 503);
}

function languageFile(language) {
    return LANGUAGE_FILES[language] || { ext: "txt", mime: "text/plain" };
}

function assertChallengeId(challengeId) {
    const id = String(challengeId ?? "");
    if (!/^\d{1,19}$/.test(id)) {
        throw new ApiError("Invalid challenge id", 400);
    }
    return id;
}

async function resolveContext({ userId, challengeId }) {
    const id = assertChallengeId(challengeId);
    const response = await challengeDb.getChallengeContext({ userId, challengeId: id });
    const ctx = response?.rows?.[0];

    if (!ctx) {
        throw new ApiError("Challenge not found", 404);
    }

    if (ctx.status !== "open") {
        throw new ApiError("This challenge is not open for submissions yet", 403);
    }

    if (!ctx.lesson_status || !ctx.has_access) {
        throw new ApiError("Register for this course to take its challenges", 403, { code: "COURSE_ACCESS_REQUIRED" });
    }

    if (ctx.lesson_status === "enrolled") {
        throw new ApiError("Complete the previous lessons to unlock this challenge", 403);
    }

    return ctx;
}

async function readStorageFile(objectKey, { cache = true } = {}) {
    if (!objectKey) return null;

    const cacheKey = cacheKeys.challengeFile(objectKey);

    if (cache) {
        const cached = await redis.get(cacheKey);
        if (typeof cached === "string") return cached;
    }

    const content = await s3.getText(objectKey);

    if (cache) {
        await redis.set(cacheKey, content, { ex: TTL.CHALLENGE_FILE });
    }

    return content;
}

// What a submission earned, as returned to the browser: points and EXP, plus the level after the
// award (level / previousLevel only when EXP was awarded, so the client can show a level-up).
function rewardView(rewards = {}) {
    const view = {
        awardedPoints: Number(rewards.awardedPoints) || 0,
        awardedExp: Number(rewards.awardedExp) || 0,
    };
    if (view.awardedExp > 0) {
        view.exp = Number(rewards.exp) || 0;
        view.level = Number(rewards.level) || 1;
        view.previousLevel = Number(rewards.previousLevel) || view.level;
    }
    if (rewards.achievements?.length) view.achievements = rewards.achievements;
    return view;
}

/** Points, EXP, overview and learning progress changed: drop caches and tell the user's other tabs. */
async function afterSubmission({ userId, ctx, passed, rewards }) {
    await invalidateUserCache(userId);
    publishToUser(userId, events.CHALLENGE_SUBMITTED, {
        challengeId: String(ctx.id),
        type: ctx.type,
        passed: Boolean(passed),
        ...rewards,
    });
}

// ------------------------------------------------------------------ quiz

function normaliseAnswer(question, raw) {
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

function gradeQuiz(questions, answers) {
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
function quizView(graded) {
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

async function loadQuizKey(ctx) {
    if (ctx.type !== "quiz") {
        throw new ApiError("This challenge is not a quiz", 400);
    }

    // Server-side only (never sent to the client); edits reach learners within the TTL.
    // An empty key is not cached, so questions added to a draft quiz show up immediately.
    const questions = (await redis.remember(
        cacheKeys.challengeDefinition(ctx.id, "quiz-key"),
        TTL.CHALLENGE_DEFINITION,
        async () => {
            const rows = (await challengeDb.getQuizAnswerKey({ challengeId: ctx.id }))?.rows || [];
            return rows.length > 0 ? rows : null;
        }
    )) || [];

    if (questions.length === 0) {
        throw new ApiError("This quiz has no questions yet", 409);
    }

    return pickQuestions(questions, { userDbId: ctx.user_db_id, count: ctx.quiz_display_count });
}

/**
 * Groups attempt rows into graded attempts and derives the learner's quiz status.
 * `rows`: getQuizAttempts output (question_id, option_id, attempt_no, wait_seconds).
 */
function evaluateQuizHistory(questions, rows) {
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

function quizStateView(ctx, history) {
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
    };
}

async function loadQuizHistory(ctx, questions) {
    const res = await challengeDb.getQuizAttempts({
        userDbId: ctx.user_db_id,
        challengeId: ctx.id,
        cooldownSec: QUIZ_COOLDOWN_SECONDS,
    });
    return evaluateQuizHistory(questions, res?.rows || []);
}

// ------------------------------------------------------------------ coding

function maxCodingAttempts(definition) {
    const configured = Number(definition?.max_attempts) || 0;
    return configured > 0 ? Math.min(configured, MAX_CODING_ATTEMPTS) : MAX_CODING_ATTEMPTS;
}

const pendingKey = (submissionId) => `challenge:pending:${submissionId}`;

function normaliseTestCases(testCases = []) {
    return testCases.map((tc) => ({
        id: String(tc.id),
        name: tc.name || "Test case",
        input: parseJsonSafe(tc.input, {}),
        expected: tc.expected,
        score: Number(tc.score) || 0,
        isSample: Boolean(tc.is_sample),
        isHidden: Boolean(tc.is_hidden),
    }));
}

/**
 * Grades reported outputs ({ [testId]: { output, error, timeMs, timedOut } }) per test. javascript
 * outputs are function return values; every other language is graded on its stdout.
 */
function gradeTests(testCases, results, language = "javascript") {
    const stdio = language !== "javascript";
    return testCases.map((tc) => {
        const reported = results?.[tc.id] || null;
        const timeMs = Math.max(0, Math.min(Math.round(Number(reported?.timeMs) || 0), 600000));

        let status = "failed";
        if (!reported) {
            status = "error";
        } else if (reported.timedOut) {
            status = "timeout";
        } else if (reported.error) {
            status = "error";
        } else if (stdio ? stdoutMatches(reported.output, tc.expected) : outputsMatch(reported.output, tc.expected)) {
            status = "passed";
        }

        return {
            testCaseId: tc.id,
            name: tc.name,
            isHidden: tc.isHidden,
            status,
            timeMs,
            weight: tc.score,
            actual: tc.isHidden ? undefined : stdio ? stdoutValue(reported?.output) : toJsonValue(reported?.output),
            expected: tc.isHidden ? undefined : parseJsonSafe(tc.expected),
            error: tc.isHidden ? undefined : (reported?.error ? String(reported.error).slice(0, 500) : null),
        };
    });
}

function summariseGrading(graded, { scoringMode, points }) {
    const testsTotal = graded.length;
    const testsPassed = graded.filter((t) => t.status === "passed").length;
    const allPassed = testsTotal > 0 && testsPassed === testsTotal;

    let score = 0;
    if (scoringMode === "test_case") {
        const totalWeight = graded.reduce((sum, t) => sum + (t.weight || 1), 0);
        const passedWeight = graded.filter((t) => t.status === "passed").reduce((sum, t) => sum + (t.weight || 1), 0);
        score = totalWeight > 0 ? Math.round((points * passedWeight / totalWeight) * 100) / 100 : 0;
    } else {
        score = allPassed ? points : 0;
    }

    const testResults = graded.map((t) => ({
        testCaseId: t.testCaseId,
        status: t.status,
        timeMs: t.timeMs,
        score: t.status === "passed" ? (t.weight || 0) : 0,
    }));

    return { testResults, testsTotal, testsPassed, allPassed, score };
}

function testView(t) {
    return {
        id: t.testCaseId,
        name: t.name,
        isHidden: t.isHidden,
        status: t.status,
        timeMs: t.timeMs,
        actual: t.actual,
        expected: t.expected,
        error: t.error,
    };
}

function submissionView(row) {
    if (!row) return null;

    // A submission that was started but never finished keeps its attempt; show it as expired.
    const age = Date.now() - new Date(row.submitted_at).getTime();
    const status = row.status === "pending" && age > PENDING_SUBMISSION_TTL_SEC * 1000 ? "expired" : row.status;

    return { ...row, status };
}

/**
 * Runs the tests in the code runner (sandbox) with the challenge's own limits and harness.
 * Returns outputs in the browser's report shape, so gradeTests grades both the same way.
 */
async function runOnServer({ definition, code, testCases }) {
    const language = codingLanguage(definition);
    if (language !== "javascript") {
        return executeTests({
            language,
            code,
            tests: testCases.map((tc) => ({ id: tc.id, input: tc.input })),
            timeLimitMs: Number(definition.time_limit_ms) || 2000,
            memoryLimitMb: Number(definition.memory_limit_mb) || 128,
        });
    }

    const files = definition.files || [];
    const starterFile = files.find((f) => f.role === "starter" || !f.role) || null;
    const harnessFile = files.find((f) => f.role === "harness") || null;
    const [starterCode, harnessCode] = await Promise.all([
        readStorageFile(starterFile?.object_key),
        readStorageFile(harnessFile?.object_key),
    ]);

    return executeTests({
        language,
        code,
        harness: harnessCode,
        entry: detectEntryName(starterCode || code),
        tests: testCases.map((tc) => ({ id: tc.id, input: tc.input })),
        timeLimitMs: Number(definition.time_limit_ms) || 2000,
        memoryLimitMb: Number(definition.memory_limit_mb) || 128,
    });
}

/** Language of a coding challenge (its starter file). Only javascript runs in the browser. */
function codingLanguage(definition) {
    const starterFile = (definition.files || []).find((f) => f.role === "starter" || !f.role);
    return starterFile?.language || "javascript";
}

function assertSourceSize(code) {
    if (typeof code !== "string" || code.trim().length === 0) {
        throw new ApiError("Source code is required", 400);
    }
    if (Buffer.byteLength(code, "utf8") > MAX_SOURCE_BYTES) {
        throw new ApiError(`Source code exceeds ${MAX_SOURCE_BYTES / 1024}KB`, 413);
    }
}

async function loadCodingDefinition(ctx) {
    if (!CODING_TYPES.has(ctx.type)) {
        throw new ApiError("This challenge is not a coding challenge", 400);
    }

    const definition = await redis.remember(
        cacheKeys.challengeDefinition(ctx.id, "coding"),
        TTL.CHALLENGE_DEFINITION,
        async () => (await challengeDb.getCodingDefinition({ challengeId: ctx.id }))?.rows?.[0] ?? null
    );

    if (!definition) {
        throw new ApiError("Coding challenge is not configured", 404);
    }

    return definition;
}

export const challengeService = {
    // ---------------------------------------------------------------- quiz

    /**
     * Attempts used / left, the cooldown before the next attempt and the result to show.
     * Every rule here is decided on the server; the client only renders `canSubmit`.
     */
    getQuizState: async ({ userId, challengeId }) => {
        const ctx = await resolveContext({ userId, challengeId });
        const questions = await loadQuizKey(ctx);
        const history = await loadQuizHistory(ctx, questions);

        return quizStateView(ctx, history);
    },

    submitQuiz: async ({ userId, challengeId, answers }) => {
        const ctx = await resolveContext({ userId, challengeId });
        const questions = await loadQuizKey(ctx);
        const history = await loadQuizHistory(ctx, questions);

        if (history.passedAttempt) {
            throw new ApiError("You have already passed this quiz", 409);
        }

        // Partial submissions would waste an attempt: require an answer for every question.
        const unanswered = questions.filter((q) => normaliseAnswer(q, answers?.[q.question_id]).length === 0);
        if (unanswered.length > 0) {
            throw new ApiError("Answer every question before submitting", 400);
        }

        const graded = gradeQuiz(questions, answers || {});

        // Attempt limit and cooldown are re-checked under a lock inside the transaction.
        const saved = await challengeDb.saveQuizAttempt({
            userDbId: ctx.user_db_id,
            challengeId: ctx.id,
            rows: graded.rows,
            passed: graded.passed,
            points: Number(ctx.points) || 0,
            maxAttempts: MAX_QUIZ_ATTEMPTS,
            cooldownSec: QUIZ_COOLDOWN_SECONDS,
        });

        const rewards = rewardView(saved);
        await afterSubmission({ userId, ctx, passed: graded.passed, rewards });

        const state = quizStateView(ctx, await loadQuizHistory(ctx, questions));

        return { ...state, ...rewards };
    },

    /**
     * Status of every challenge a lesson requires (see challengeDb.getLessonChallenges):
     * `passed`, `exhausted` (all attempts used without a pass) and `resolved` (either one).
     */
    getLessonChallengeStatus: async ({ userId, lessonId }) => {
        const res = await challengeDb.getLessonChallenges({ userId, lessonId });
        const challenges = res?.rows || [];

        const withState = (ch, passed, exhausted) => ({
            id: ch.id,
            type: ch.type,
            title: ch.title,
            passed,
            exhausted: !passed && exhausted,
            resolved: passed || exhausted,
        });

        return Promise.all(challenges.map(async (ch) => {
            if (ch.type !== "quiz") {
                const max = maxCodingAttempts({ max_attempts: ch.coding_max_attempts });
                return withState(ch, Boolean(ch.coding_passed), Number(ch.coding_attempts) >= max);
            }

            const keyResponse = await challengeDb.getQuizAnswerKey({ challengeId: ch.id });
            const questions = pickQuestions(keyResponse?.rows || [], { userDbId: ch.user_db_id, count: ch.quiz_display_count });
            // A quiz without questions cannot be passed, so it cannot block the lesson either.
            if (questions.length === 0) return withState(ch, true, false);

            const history = await loadQuizHistory({ id: ch.id, user_db_id: ch.user_db_id }, questions);
            return withState(ch, Boolean(history.passedAttempt), history.attempts.length >= MAX_QUIZ_ATTEMPTS);
        }));
    },

    /**
     * Throws 403 unless every required challenge of the lesson is resolved: passed, or all of
     * its attempts used without a pass (the learner may then move on to the next lesson).
     */
    assertLessonChallengesPassed: async ({ userId, lessonId }) => {
        const status = await challengeService.getLessonChallengeStatus({ userId, lessonId });
        const pending = status.filter((ch) => !ch.resolved);

        if (pending.length > 0) {
            throw new ApiError(
                `Pass every challenge in this lesson first, or use all its attempts (${status.length - pending.length}/${status.length} done). Remaining: ${pending.map((ch) => ch.title).join(", ")}.`,
                403
            );
        }

        return status;
    },

    // ---------------------------------------------------------------- coding

    getCodingWorkspace: async ({ userId, challengeId }) => {
        const ctx = await resolveContext({ userId, challengeId });
        const definition = await loadCodingDefinition(ctx);

        const workspaceRes = await challengeDb.getCodingWorkspace({ userDbId: ctx.user_db_id, challengeId: ctx.id });

        const files = definition.files || [];
        const starterFile = files.find((f) => f.role === "starter" || !f.role) || null;
        const harnessFile = files.find((f) => f.role === "harness") || null;
        const workspace = workspaceRes?.rows?.[0] || {};

        const [starterCode, harnessCode, serverCode] = await Promise.all([
            readStorageFile(starterFile?.object_key),
            readStorageFile(harnessFile?.object_key),
            workspace.object_key
                ? readStorageFile(workspace.object_key, { cache: false }).catch(() => null)
                : Promise.resolve(null),
        ]);

        // Only sample (public) tests reach the browser before a submission: hidden inputs are
        // handed out once an attempt has been recorded, and hidden outputs never leave the server.
        const testCases = normaliseTestCases(definition.test_cases);
        const publicTests = testCases.filter((tc) => !tc.isHidden).map((tc) => ({
            id: tc.id,
            name: tc.name,
            input: tc.input,
            isHidden: false,
            expected: parseJsonSafe(tc.expected),
        }));

        return {
            challengeId: ctx.id,
            publicId: ctx.public_id,
            type: ctx.type,
            points: Number(ctx.points) || 0,
            language: starterFile?.language || workspace.language || "javascript",
            filePath: starterFile?.file_path || "solution.js",
            executionMode: definition.execution_mode,
            timeLimitMs: Number(definition.time_limit_ms) || 2000,
            scoringMode: definition.scoring_mode,
            maxAttempts: maxCodingAttempts(definition),
            starterCode: starterCode ?? "",
            harnessCode: harnessCode ?? null,
            tests: publicTests,
            hiddenCount: testCases.length - publicTests.length,
            attempts: Number(workspace.attempts) || 0,
            hasPassed: Boolean(workspace.has_passed),
            lastSubmission: submissionView(workspace.last_submission),
            server: serverCode !== null && serverCode !== undefined
                ? {
                    code: serverCode,
                    version: Number(workspace.version) || 1,
                    updatedAt: workspace.updated_at ? new Date(workspace.updated_at).toISOString() : null,
                }
                : null,
        };
    },

    /**
     * "Run" for languages the browser cannot execute: runs the sample tests in the code runner and
     * grades them. Nothing is recorded and no attempt is used; hidden tests never run here.
     */
    runCodingSamples: async ({ userId, challengeId, code }) => {
        const ctx = await resolveContext({ userId, challengeId });
        assertSourceSize(code);
        const definition = await loadCodingDefinition(ctx);
        if (!serverExecutionEnabled()) throw codeRunnerRequired();

        const language = codingLanguage(definition);
        const samples = normaliseTestCases(definition.test_cases).filter((tc) => !tc.isHidden);
        if (samples.length === 0) return { tests: [] };

        const executed = await runOnServer({ definition, code, testCases: samples });
        return {
            tests: gradeTests(samples, executed, language).map((t) => ({
                ...testView(t),
                // Raw stdout keeps the learner's formatting in the output panel.
                output: executed[t.testCaseId]?.output ?? null,
            })),
        };
    },

    /**
     * Submission step 1. Requires every sample test to pass, then snapshots the code to S3 and
     * records a `pending` submission (this is what uses up an attempt) before revealing the
     * hidden test inputs for step 2.
     */
    startCodingSubmission: async ({ userId, challengeId, code, results }) => {
        const ctx = await resolveContext({ userId, challengeId });
        assertSourceSize(code);
        const size = Buffer.byteLength(code, "utf8");

        const definition = await loadCodingDefinition(ctx);
        const language = codingLanguage(definition);
        const testCases = normaliseTestCases(definition.test_cases);
        const publicCases = testCases.filter((tc) => !tc.isHidden);
        const hiddenCases = testCases.filter((tc) => tc.isHidden);

        if (testCases.length === 0) {
            throw new ApiError("This challenge has no test cases yet", 409);
        }

        // With a code runner configured, the server runs every test itself before an attempt is
        // used (a runner outage costs no attempt) and ignores the outputs the browser reported.
        const serverRun = serverExecutionEnabled();
        // Only javascript runs in the browser; other languages cannot be graded without the runner.
        if (!serverRun && language !== "javascript") throw codeRunnerRequired();
        const executed = serverRun ? await runOnServer({ definition, code, testCases }) : results;

        const publicGraded = gradeTests(publicCases, executed, language);
        const failingSample = publicGraded.find((t) => t.status !== "passed");
        if (failingSample) {
            throw new ApiError(`Pass every sample test before submitting ("${failingSample.name}" did not pass).`, 409);
        }

        const starterFile = (definition.files || []).find((f) => f.role === "starter" || !f.role) || null;
        const { ext, mime } = languageFile(language);
        const codeSha256 = crypto.createHash("sha256").update(code).digest("hex");

        // 1) Upload the snapshot; 2) record the attempt; 3) roll the object back if the DB write fails.
        const objectKey = `coding/submissions/${userId}/${ctx.public_id}/${ulid()}.${ext}`;
        await s3.putText({
            key: objectKey,
            body: code,
            contentType: `${mime}; charset=utf-8`,
            metadata: { challenge: ctx.public_id },
        });

        let created;
        try {
            created = await challengeDb.createPendingCodingSubmission({
                userDbId: ctx.user_db_id,
                challengeId: ctx.id,
                language,
                maxAttempts: maxCodingAttempts(definition),
                asset: {
                    publicId: `ast_${ulid().toLowerCase()}`,
                    objectKey,
                    mimeType: mime,
                    size,
                    originalName: starterFile?.file_path || `solution.${ext}`,
                },
                submission: {
                    publicId: `sub_${ulid().toLowerCase()}`,
                    snapshot: {
                        s3_key: objectKey,
                        s3_bucket: bucketForKey(objectKey),
                        snapshot_size: size,
                        code_sha256: codeSha256,
                    },
                },
                workspace: {
                    publicId: `ws_${ulid().toLowerCase()}`,
                    filePath: starterFile?.file_path || `solution.${ext}`,
                },
            });
        } catch (error) {
            // If the COMMIT outcome is unknown the row may reference this object: keep it
            // (an orphaned object is harmless, a dangling asset row is not).
            if (error?.commitUncertain) {
                console.error("[challenge] Commit outcome unknown, keeping S3 snapshot:", objectKey);
            } else {
                await s3.delete(objectKey).catch((cleanupError) => {
                    console.error("[challenge] Failed to roll back S3 snapshot:", objectKey, cleanupError?.message);
                });
            }
            throw error;
        }

        const submissionId = created.submission.public_id;

        await redis.set(pendingKey(submissionId), {
            userDbId: String(ctx.user_db_id),
            challengeId: String(ctx.id),
            startedAt: new Date().toISOString(),
            attempts: created.attempts,
            codeSha256,
            publicGraded,
            serverRun,
            hiddenGraded: serverRun ? gradeTests(hiddenCases, executed, language) : null,
        }, { ex: PENDING_SUBMISSION_TTL_SEC });

        return {
            challengeId: ctx.id,
            submissionId,
            attempts: created.attempts,
            maxAttempts: maxCodingAttempts(definition),
            // Graded on the server already: hidden inputs never need to reach the browser.
            hiddenTests: serverRun
                ? []
                : hiddenCases.map((tc) => ({ id: tc.id, name: tc.name, input: tc.input, isHidden: true })),
        };
    },

    /** Submission step 2: grades the hidden tests, finalizes the attempt and awards points once. */
    finishCodingSubmission: async ({ userId, challengeId, submissionId, results }) => {
        const ctx = await resolveContext({ userId, challengeId });

        if (!/^sub_[a-z0-9]{26}$/.test(String(submissionId || ""))) {
            throw new ApiError("Invalid submission id", 400);
        }

        const pending = await redis.get(pendingKey(submissionId));
        if (!pending || pending.userDbId !== String(ctx.user_db_id) || pending.challengeId !== String(ctx.id)) {
            throw new ApiError("This submission has expired. It still counts as an attempt; submit again to be graded.", 410);
        }

        const definition = await loadCodingDefinition(ctx);
        const points = Number(ctx.points) || 0;
        const hiddenCases = normaliseTestCases(definition.test_cases).filter((tc) => tc.isHidden);
        // Server-graded at start: the browser's report for this step is ignored.
        const hiddenGraded = pending.serverRun ? (pending.hiddenGraded || []) : gradeTests(hiddenCases, results, codingLanguage(definition));
        const graded = [...(pending.publicGraded || []), ...hiddenGraded];
        const grading = summariseGrading(graded, { scoringMode: definition.scoring_mode, points });

        const starterFile = (definition.files || []).find((f) => f.role === "starter" || !f.role) || null;
        const language = starterFile?.language || "javascript";
        const firstError = graded.find((t) => t.error)?.error || null;
        const executionTimeMs = graded.reduce((sum, t) => sum + t.timeMs, 0);
        const status = grading.allPassed ? "passed" : "failed";

        const saved = await challengeDb.finalizeCodingSubmission({
            userDbId: ctx.user_db_id,
            challengeId: ctx.id,
            submissionPublicId: submissionId,
            language,
            status,
            score: grading.score,
            passed: grading.allPassed,
            points,
            snapshot: {
                tests_total: grading.testsTotal,
                tests_passed: grading.testsPassed,
                has_hidden_failed: graded.some((t) => t.isHidden && t.status !== "passed"),
                execution_time_ms: executionTimeMs,
                error_message: firstError,
            },
            run: {
                publicId: `run_${ulid().toLowerCase()}`,
                startedAt: new Date(pending.startedAt),
                stdout: null,
                stderr: firstError,
                executionTimeMs,
                passedTests: grading.testsPassed,
                totalTests: grading.testsTotal,
            },
            testResults: grading.testResults,
        });

        await redis.del(pendingKey(submissionId));
        const rewards = rewardView(saved);
        await afterSubmission({ userId, ctx, passed: grading.allPassed, rewards });

        return {
            challengeId: ctx.id,
            submissionId: saved.submission.public_id,
            submittedAt: new Date(saved.submission.submitted_at).toISOString(),
            status,
            passed: grading.allPassed,
            score: Number(grading.score) || 0,
            points,
            testsPassed: grading.testsPassed,
            testsTotal: grading.testsTotal,
            ...rewards,
            attempts: Number(pending.attempts) || null,
            maxAttempts: maxCodingAttempts(definition),
            tests: graded.map(testView),
        };
    },

    // ---------------------------------------------------------------- hints

    /**
     * Opens hint `level` (1-3, in order) and returns its text. Level 3 opened before the first
     * pass halves the challenge EXP (challengeDb awardChallengeRewards).
     */
    openHint: async ({ userId, challengeId, level }) => {
        const n = Number(level);
        if (!Number.isInteger(n) || n < 1 || n > 3) {
            throw new ApiError("Invalid hint level", 400);
        }

        const ctx = await resolveContext({ userId, challengeId });
        const hint = await challengeDb.openHint({ userDbId: ctx.user_db_id, challengeId: ctx.id, level: n });

        if (!hint) throw new ApiError("This challenge has no such hint", 404);
        if (hint.locked) throw new ApiError("Open the previous hint first", 409);

        // The learning_progress payload (cached per user) lists the opened hints.
        await invalidateUserCache(userId);
        return { level: n, body: hint.body };
    },

    // Removes grading data the browser must never see from the learning_progress payload.
    sanitizeLearningProgress: (progress) => {
        if (!progress?.modules) return progress;

        return {
            ...progress,
            modules: progress.modules.map((module) => ({
                ...module,
                lessons: (module.lessons || []).map((lesson) => ({
                    ...lesson,
                    challenges: (lesson.challenges || []).filter(Boolean).map((challenge) => {
                        const { starter_code: _starterCode, question_id: _questionId, ...rest } = challenge;

                        // Never ship correct answers to the browser.
                        if (Array.isArray(rest.questions)) {
                            rest.questions = rest.questions.map((question) => ({
                                ...question,
                                options: (question.options || []).map(({ is_correct: _isCorrect, ...option }) => option),
                            }));
                        }

                        if (!rest.coding) return rest;

                        const { test_cases: testCases, object_key: _objectKey, starter_code: _starter, ...coding } = rest.coding;

                        // Older DB functions inlined test cases (incl. hidden expected output).
                        if (Array.isArray(testCases)) {
                            coding.tests_total = testCases.length;
                            coding.tests_visible = testCases.filter((tc) => !tc.is_hidden).length;
                        }

                        return { ...rest, coding };
                    }),
                })),
            })),
        };
    },
};
