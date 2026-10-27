import { describe, expect, it } from "vitest";

import { checkCourse } from "@/content/tools/verify-course.mjs";

const tf = (isTrue) => ({
    type: "single_choice", question: "Statement", explanation: "Why",
    options: [{ text: "True", correct: isTrue }, { text: "False", correct: !isTrue }],
});
const coding = (publicId, type, title = "Task") => ({
    publicId, type, difficulty: "easy", title, outcomes: ["o1", "o2", "o3", "o4"],
    hints: ["a", "b", "c"], tests: [{ name: "public" }, { name: "hidden", hidden: true }],
});

// A tier 1 course that meets every check: 10 lessons, 20 statements (10 False), 4 + 2 coding.
function validCourse() {
    const course = {
        publicId: "demo", level: "beginner", domain: "backend",
        learningOutcomes: ["o1", "o2", "o3", "o4"].map((code) => ({ code, text: `Outcome ${code}` })),
        testedVersions: { "Node.js": "24" }, lastReviewedAt: "2026-10-01",
        sourceLinks: ["https://developer.mozilla.org/"], owner: "Content team", knownIssues: [],
        completionRules: {}, scenario: { title: "Broken page", quiz: "q0", fixBug: "f1" },
    };
    const lessons = Array.from({ length: 10 }, (_, i) => ({
        folder: `l${i}`,
        challenges: [{ publicId: `q${i}`, type: "quiz", outcomes: ["o1", "o2", "o3", "o4"], questions: i === 0 ? [tf(true), tf(false), tf(true), tf(false), tf(true)] : [tf(i % 2 === 0)] }],
    }));
    lessons[9].challenges[0].questions.push(...Array.from({ length: 6 }, (_, i) => tf(i < 3 ? false : true)));
    for (let i = 0; i < 4; i++) lessons[i + 1].challenges.push(coding(`s${i}`, "mini_coding"));
    lessons[5].challenges.push(coding("f1", "fix_bug"));
    lessons[6].challenges.push(coding("f2", "fix_bug", "Spot the AI Mistake: CORS"));
    return { course, lessons };
}

describe("checkCourse", () => {
    it("passes a course that meets the tier 1 Definition of Done", () => {
        const { course, lessons } = validCourse();
        const result = checkCourse(course, lessons);
        expect(result.errors).toEqual([]);
        expect(result.counts).toMatchObject({ lessons: 10, trueFalse: 20, falsePercent: 50 });
    });

    it("reports missing metadata, counts, balance, scenario, hints and outcome coverage", () => {
        const { course, lessons } = validCourse();
        delete course.domain;
        course.lastReviewedAt = "2999-01-01";
        course.scenario.fixBug = "s0";
        lessons.pop();
        lessons[0].challenges[0].questions = [tf(false), tf(false), tf(false), tf(false), tf(false)];
        lessons[1].challenges[1].hints = ["only one"];
        lessons[2].challenges[1].tests = [{ name: "public" }];
        for (const lesson of lessons) for (const c of lesson.challenges) if (c.type !== "quiz") c.outcomes = ["o1"];

        const { errors } = checkCourse(course, lessons);
        expect(errors).toEqual(expect.arrayContaining([
            expect.stringContaining('"domain"'),
            expect.stringContaining('"lastReviewedAt"'),
            "tier 1 needs 10 lessons (has 9)",
            expect.stringMatching(/needs 20 True\/False/),
            expect.stringMatching(/are False \(needs 40-60%\)/),
            expect.stringContaining('scenario.fixBug "s0"'),
            "s0: needs 3 hints (has 1)",
            "s1: needs at least one hidden test",
            'outcome "o2" has no coding challenge',
        ]));
    });

    it("counts only the statements a question bank shows, and keeps the scenario quiz in order", () => {
        const { course, lessons } = validCourse();
        lessons[9].challenges[0].displayCount = 2;
        lessons[0].challenges[0].displayCount = 4;
        const { errors } = checkCourse(course, lessons);
        expect(errors).toEqual(expect.arrayContaining([
            "tier 1 needs 20 True/False statements shown to a learner (has 14)",
            'scenario quiz q0 must not use "displayCount": its statements follow the evidence in order',
        ]));
    });

    it("needs a Spot the AI Mistake fix-bug and the right difficulty mix for the tier", () => {
        const { course, lessons } = validCourse();
        course.level = "intermediate";
        lessons[6].challenges[1].title = "Fix the cache";
        const { tier, errors } = checkCourse(course, lessons);
        expect(tier).toBe(2);
        expect(errors).toEqual(expect.arrayContaining([
            'no fix_bug challenge titled "Spot the AI Mistake: ..."',
            "tier 2 needs 4 medium mini_coding challenges (has 0)",
            "tier 2 needs 2 medium fix_bug challenges (has 0)",
        ]));
    });
});
