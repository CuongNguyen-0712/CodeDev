import { outputsMatch, parseJsonSafe, stdoutMatches, stdoutValue, toJsonValue } from "@/lib/challenges/compare";
import { isBrowserLanguage } from "@/lib/challenges/languages";

/** Coding test grading and the per-test view the browser gets (pure: no database, no runner). */

export function normaliseTestCases(testCases = []) {
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
 * and config-file outputs are harness return values; every other language is graded on its stdout.
 */
export function gradeTests(testCases, results, language = "javascript") {
    const stdio = !isBrowserLanguage(language);
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

export function summariseGrading(graded, { scoringMode, points }) {
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

export function testView(t) {
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
