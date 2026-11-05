import { describe, expect, it } from "vitest";

import { checkLessons, snippetErrors } from "@/content/tools/verify-course.mjs";

const coding = (snippets) => ({ publicId: "chal_x", type: "mini_coding", coding: { snippets } });
const quiz = { publicId: "chal_q", type: "quiz", questions: [] };

describe("snippetErrors", () => {
    it("accepts no snippets and a valid list", () => {
        expect(snippetErrors(coding(undefined))).toEqual([]);
        expect(snippetErrors(coding([{ id: "a", label: "Read input", code: "const x = 1;", note: "fill the gap" }]))).toEqual([]);
    });

    it("rejects duplicates, long labels, empty code, unknown fields and too many snippets", () => {
        const errors = snippetErrors(coding([
            { id: "a", label: "x".repeat(61), code: "1" },
            { id: "a", label: "ok", code: " " },
            { id: "b", label: "ok", code: "1", lang: "js" },
        ]));
        expect(errors.join("\n")).toMatch(/1-60 characters/);
        expect(errors.join("\n")).toMatch(/duplicate id "a"/);
        expect(errors.join("\n")).toMatch(/needs "code"/);
        expect(errors.join("\n")).toMatch(/unknown field\(s\) lang/);
        const many = Array.from({ length: 13 }, (_, i) => ({ id: `s${i}`, label: "l", code: "c" }));
        expect(snippetErrors(coding(many))).toEqual(["chal_x: at most 12 snippets (has 13)"]);
        expect(snippetErrors({ ...quiz, coding: { snippets: [] } })).toEqual(["chal_q: a quiz cannot have snippets"]);
    });
});

describe("checkLessons", () => {
    it("allows 1-2 challenges per lesson", () => {
        expect(checkLessons([{ folder: "01", challenges: [quiz, coding()] }]).errors).toEqual([]);
        expect(checkLessons([{ folder: "02", challenges: [] }]).errors).toEqual(["02: a lesson needs at least 1 challenge"]);
        expect(checkLessons([{ folder: "03", challenges: [quiz, quiz, quiz] }]).errors).toEqual(["03: 3 challenges (at most 2 per lesson)"]);
    });

    it("only warns for a legacy course", () => {
        const result = checkLessons([{ folder: "03", challenges: [quiz, quiz, quiz] }], { legacy: true });
        expect(result.errors).toEqual([]);
        expect(result.warnings).toHaveLength(1);
    });
});

describe("piece lists (pieces.json)", () => {
    const piece = (id, extra = {}) => ({ id, label: id, code: `${id}();`, ...extra });

    it("accepts a generated list with distractors", () => {
        expect(snippetErrors({ publicId: "c", type: "mini_coding", pieces: [piece("a"), piece("b"), piece("b-wrong", { distractor: true })] })).toEqual([]);
    });

    it("rejects a bad distractor flag and two sources at once", () => {
        expect(snippetErrors({ publicId: "c", type: "mini_coding", pieces: [piece("a", { distractor: "yes" })] }).join()).toMatch(/"distractor" must be true/);
        expect(snippetErrors({ publicId: "c", type: "mini_coding", pieces: [piece("a")], coding: { snippets: [piece("a")] } }))
            .toEqual(["c: coding.snippets and pieces.json: keep one"]);
    });
});
