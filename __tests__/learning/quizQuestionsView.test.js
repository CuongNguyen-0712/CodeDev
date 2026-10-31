import { describe, expect, it } from "vitest";

import { quizQuestionsView } from "@/lib/challenges/quiz";

describe("quizQuestionsView", () => {
    it("sends the question and its options without the answer key", () => {
        const [view] = quizQuestionsView([{
            question_id: "41",
            content: "2 + 2?",
            points: "10",
            question_type: "single_choice",
            explanation: "Basic sum",
            correct_options: ["7"],
            all_options: ["7", "8"],
            options: [{ id: "7", content: "4" }, { id: "8", content: "5" }],
        }]);

        expect(view).toEqual({
            id: "41",
            content: "2 + 2?",
            type: "single_choice",
            points: 10,
            options: [{ id: "7", content: "4" }, { id: "8", content: "5" }],
        });
    });
});
