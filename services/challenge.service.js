import { ulid } from "ulid";

import { challengeDb } from "@/db/challenge.db";
import { s3, bucketForKey } from "@/lib/s3";
import { redis } from "@/lib/cache";
import { cacheKeys, TTL, invalidateUserCache } from "@/lib/cacheKeys";
import { publishToUser } from "@/lib/pusher";
import { events } from "@/lib/realtime";
import { ApiError } from "@/lib/error/apiError";
import { outputsMatch, parseJsonSafe, toJsonValue } from "@/lib/challenges/compare";

export const QUIZ_PASS_RATIO = 0.7;
export const MAX_SOURCE_BYTES = 64 * 1024;

const CODING_TYPES = new Set(["fix_bug", "mini_coding"]);

const LANGUAGE_FILES = {
    javascript: { ext: "js", mime: "application/javascript" },
    typescript: { ext: "ts", mime: "application/typescript" },
    python: { ext: "py", mime: "text/x-python" },
};

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

    if (!ctx.lesson_status) {
        throw new ApiError("Register for this course to take its challenges", 403);
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

/** Points, overview and learning progress changed: drop caches and tell the user's other tabs. */
async function afterSubmission({ userId, ctx, passed, awardedPoints }) {
    await invalidateUserCache(userId);
    publishToUser(userId, events.CHALLENGE_SUBMITTED, {
        challengeId: String(ctx.id),
        type: ctx.type,
        passed: Boolean(passed),
        awardedPoints: Number(awardedPoints) || 0,
    });
}

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

function gradeQuiz(questions, answers) {
    let earnedPoints = 0;
    let totalPoints = 0;
    const results = {};
    const rows = [];

    for (const q of questions) {
        const qId = q.question_id;
        const points = Number(q.points) || 0;
        const correct = (q.correct_options || []).map(String);
        const valid = new Set((q.all_options || []).map(String));
        const raw = answers?.[qId];

        totalPoints += points;

        // Ignore option ids that do not belong to this question.
        let selected = [];
        if (q.question_type === "multiple_choice") {
            selected = Array.isArray(raw) ? [...new Set(raw.map(String))] : [];
        } else if (raw !== undefined && raw !== null && !Array.isArray(raw)) {
            selected = [String(raw)];
        }
        selected = selected.filter((optId) => valid.has(optId));

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

function gradeCoding({ testCases, results, scoringMode, points }) {
    const graded = testCases.map((tc) => {
        const reported = results?.[tc.id] || null;
        const timeMs = Math.max(0, Math.min(Math.round(Number(reported?.timeMs) || 0), 600000));

        let status = "failed";
        if (!reported) {
            status = "error";
        } else if (reported.timedOut) {
            status = "timeout";
        } else if (reported.error) {
            status = "error";
        } else if (outputsMatch(reported.output, tc.expected)) {
            status = "passed";
        }

        return {
            testCaseId: tc.id,
            name: tc.name,
            isHidden: tc.isHidden,
            status,
            timeMs,
            weight: tc.score,
            actual: tc.isHidden ? undefined : toJsonValue(reported?.output),
            expected: tc.isHidden ? undefined : parseJsonSafe(tc.expected),
            error: tc.isHidden ? undefined : (reported?.error ? String(reported.error).slice(0, 500) : null),
        };
    });

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

    return { graded, testResults, testsTotal, testsPassed, allPassed, score };
}

export const challengeService = {
    submitQuiz: async ({ userId, challengeId, answers }) => {
        const ctx = await resolveContext({ userId, challengeId });

        if (ctx.type !== "quiz") {
            throw new ApiError("This challenge is not a quiz", 400);
        }

        const keyResponse = await challengeDb.getQuizAnswerKey({ challengeId: ctx.id });
        const questions = keyResponse?.rows || [];

        if (questions.length === 0) {
            throw new ApiError("This quiz has no questions yet", 409);
        }

        const graded = gradeQuiz(questions, answers || {});
        const { awardedPoints } = await challengeDb.saveQuizAttempt({
            userDbId: ctx.user_db_id,
            challengeId: ctx.id,
            rows: graded.rows,
            passed: graded.passed,
            points: Number(ctx.points) || 0,
        });

        await afterSubmission({ userId, ctx, passed: graded.passed, awardedPoints });

        return {
            challengeId: ctx.id,
            earnedPoints: graded.earnedPoints,
            totalPoints: graded.totalPoints,
            percentage: graded.percentage,
            passed: graded.passed,
            results: graded.results,
            awardedPoints,
        };
    },

    getCodingWorkspace: async ({ userId, challengeId }) => {
        const ctx = await resolveContext({ userId, challengeId });

        if (!CODING_TYPES.has(ctx.type)) {
            throw new ApiError("This challenge is not a coding challenge", 400);
        }

        const [definitionRes, workspaceRes] = await Promise.all([
            challengeDb.getCodingDefinition({ challengeId: ctx.id }),
            challengeDb.getCodingWorkspace({ userDbId: ctx.user_db_id, challengeId: ctx.id }),
        ]);

        const definition = definitionRes?.rows?.[0];
        if (!definition) {
            throw new ApiError("Coding challenge is not configured", 404);
        }

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

        // Hidden tests ship their input only; expected outputs never leave the server.
        const tests = normaliseTestCases(definition.test_cases).map((tc) => ({
            id: tc.id,
            name: tc.name,
            input: tc.input,
            isHidden: tc.isHidden,
            expected: tc.isHidden ? undefined : parseJsonSafe(tc.expected),
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
            maxAttempts: definition.max_attempts ? Number(definition.max_attempts) : null,
            starterCode: starterCode ?? "",
            harnessCode: harnessCode ?? null,
            tests,
            attempts: Number(workspace.attempts) || 0,
            hasPassed: Boolean(workspace.has_passed),
            lastSubmission: workspace.last_submission || null,
            server: serverCode !== null && serverCode !== undefined
                ? {
                    code: serverCode,
                    version: Number(workspace.version) || 1,
                    updatedAt: workspace.updated_at ? new Date(workspace.updated_at).toISOString() : null,
                }
                : null,
        };
    },

    submitCoding: async ({ userId, challengeId, code, results }) => {
        const ctx = await resolveContext({ userId, challengeId });

        if (!CODING_TYPES.has(ctx.type)) {
            throw new ApiError("This challenge is not a coding challenge", 400);
        }

        if (typeof code !== "string" || code.trim().length === 0) {
            throw new ApiError("Source code is required", 400);
        }

        const size = Buffer.byteLength(code, "utf8");
        if (size > MAX_SOURCE_BYTES) {
            throw new ApiError(`Source code exceeds ${MAX_SOURCE_BYTES / 1024}KB`, 413);
        }

        const definitionRes = await challengeDb.getCodingDefinition({ challengeId: ctx.id });
        const definition = definitionRes?.rows?.[0];
        if (!definition) {
            throw new ApiError("Coding challenge is not configured", 404);
        }

        if (definition.max_attempts) {
            const attemptsRes = await challengeDb.countCodingAttempts({ userDbId: ctx.user_db_id, challengeId: ctx.id });
            const attempts = Number(attemptsRes?.rows?.[0]?.attempts) || 0;
            if (attempts >= Number(definition.max_attempts)) {
                throw new ApiError("You have used all attempts for this challenge", 429);
            }
        }

        const startedAt = new Date();
        const points = Number(ctx.points) || 0;
        const testCases = normaliseTestCases(definition.test_cases);
        const starterFile = (definition.files || []).find((f) => f.role === "starter" || !f.role) || null;
        const language = starterFile?.language || "javascript";
        const { ext, mime } = languageFile(language);

        const grading = gradeCoding({
            testCases,
            results,
            scoringMode: definition.scoring_mode,
            points,
        });

        // 1) Upload the snapshot to S3 first; 2) persist metadata; 3) roll the object back if the DB write fails.
        const objectKey = `coding/submissions/${userId}/${ctx.public_id}/${ulid()}.${ext}`;
        await s3.putText({
            key: objectKey,
            body: code,
            contentType: `${mime}; charset=utf-8`,
            metadata: { challenge: ctx.public_id },
        });

        const firstError = grading.graded.find((t) => t.error)?.error || null;
        const executionTimeMs = grading.graded.reduce((sum, t) => sum + t.timeMs, 0);
        const status = grading.allPassed ? "passed" : "failed";

        let saved;
        try {
            saved = await challengeDb.createCodingSubmission({
                userDbId: ctx.user_db_id,
                challengeId: ctx.id,
                language,
                passed: grading.allPassed,
                points,
                maxAttempts: definition.max_attempts ? Number(definition.max_attempts) : null,
                asset: {
                    publicId: `ast_${ulid().toLowerCase()}`,
                    objectKey,
                    mimeType: mime,
                    size,
                    originalName: starterFile?.file_path || `solution.${ext}`,
                },
                submission: {
                    publicId: `sub_${ulid().toLowerCase()}`,
                    status,
                    score: grading.score,
                    snapshot: {
                        s3_key: objectKey,
                        s3_bucket: bucketForKey(objectKey),
                        snapshot_size: size,
                        tests_total: grading.testsTotal,
                        tests_passed: grading.testsPassed,
                        has_hidden_failed: grading.graded.some((t) => t.isHidden && t.status !== "passed"),
                        execution_time_ms: executionTimeMs,
                        error_message: firstError,
                    },
                },
                run: {
                    publicId: `run_${ulid().toLowerCase()}`,
                    startedAt,
                    stdout: null,
                    stderr: firstError,
                    executionTimeMs,
                    passedTests: grading.testsPassed,
                    totalTests: grading.testsTotal,
                },
                testResults: grading.testResults,
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

        await afterSubmission({ userId, ctx, passed: grading.allPassed, awardedPoints: saved.awardedPoints });

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
            awardedPoints: saved.awardedPoints,
            tests: grading.graded.map((t) => ({
                id: t.testCaseId,
                name: t.name,
                isHidden: t.isHidden,
                status: t.status,
                timeMs: t.timeMs,
                actual: t.actual,
                expected: t.expected,
                error: t.error,
            })),
        };
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
