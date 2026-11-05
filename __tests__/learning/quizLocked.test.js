import { describe, expect, it } from "vitest";

import { evaluateQuizHistory, gradeQuiz, lockedAnswers, quizStateView } from "@/lib/challenges/quiz";

const questions = [
    { question_id: "q1", question_type: "single_choice", points: 5, correct_options: ["a"], all_options: ["a", "b"] },
    { question_id: "q2", question_type: "single_choice", points: 5, correct_options: ["d"], all_options: ["c", "d"] },
    { question_id: "q3", question_type: "multiple_choice", points: 5, correct_options: ["e", "f"], all_options: ["e", "f", "g"] },
];
// Attempt 1: q1 right, q2 wrong, q3 wrong. Attempt 2: q2 right (q1 kept), q3 still wrong.
const rows = [
    { attempt_no: 1, question_id: "q1", option_id: "a", created_at: "t1" },
    { attempt_no: 1, question_id: "q2", option_id: "c", created_at: "t1" },
    { attempt_no: 1, question_id: "q3", option_id: "e", created_at: "t1" },
    { attempt_no: 2, question_id: "q1", option_id: "a", created_at: "t2" },
    { attempt_no: 2, question_id: "q2", option_id: "d", created_at: "t2" },
    { attempt_no: 2, question_id: "q3", option_id: "g", created_at: "t2" },
];

describe("locked quiz answers", () => {
    it("keeps every question answered right in any earlier attempt", () => {
        const history = evaluateQuizHistory(questions, rows);
        expect(lockedAnswers(history)).toEqual({ q1: "a", q2: "d" });
    });

    it("lets the next attempt send only the wrong questions", () => {
        const history = evaluateQuizHistory(questions, rows);
        // The browser sends a wrong q1 on purpose: the kept answer wins.
        const merged = { ...{ q1: "b", q3: ["e", "f"] }, ...lockedAnswers(history) };
        const graded = gradeQuiz(questions, merged);
        expect(graded.earnedPoints).toBe(15);
        expect(graded.passed).toBe(true);
    });

    it("tells the browser which questions are locked, none once passed", () => {
        const ctx = { id: "42" };
        const failing = quizStateView(ctx, evaluateQuizHistory(questions, rows), questions);
        expect(failing.lockedQuestionIds.sort()).toEqual(["q1", "q2"]);
        const passedRows = [...rows, ...["q1:a", "q2:d", "q3:e", "q3:f"].map((s) => ({ attempt_no: 3, question_id: s.split(":")[0], option_id: s.split(":")[1], created_at: "t3" }))];
        expect(quizStateView(ctx, evaluateQuizHistory(questions, passedRows), questions).lockedQuestionIds).toEqual([]);
    });
});
