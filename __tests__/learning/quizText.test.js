import { describe, expect, it } from "vitest";

import { parseQuizText, splitInlineCode } from "@/lib/challenges/quizText";

describe("parseQuizText", () => {
    it("turns fenced evidence into a code block between text", () => {
        const text = "The orders query:\n\n```sql\nSELECT *\nFROM orders;\n```\n\nStatement: \"It scans the table\"";
        expect(parseQuizText(text)).toEqual([
            { kind: "text", text: "The orders query:" },
            { kind: "code", lang: "sql", code: "SELECT *\nFROM orders;" },
            { kind: "text", text: "Statement: \"It scans the table\"" },
        ]);
    });

    it("keeps legacy evidence layout per paragraph and marks the statement", () => {
        const text = "Token counts per language.\n\nlang  words\nen    96\nvi    140\n\nStatement: \"Vietnamese costs more\"";
        expect(parseQuizText(text)).toEqual([
            { kind: "text", text: "Token counts per language." },
            { kind: "pre", code: "lang  words\nen    96\nvi    140" },
            { kind: "text", text: "Statement: \"Vietnamese costs more\"", strong: true },
        ]);
    });

    it("shows single-line URLs and log lines as code, sentences as text", () => {
        const text = "A learner clicks this link:\n\nhttps://app.test/lessons?tab=notes#ex-3\n\nThe log shows:\n\n203.0.113.57 \"GET /lessons?tab=notes HTTP/2\" 200\n\nStatement: \"x\"";
        expect(parseQuizText(text).map((s) => s.kind)).toEqual(["text", "pre", "text", "pre", "text"]);
    });

    it("leaves a one-line question as text", () => {
        expect(parseQuizText("Which layer is rebuilt?")).toEqual([{ kind: "text", text: "Which layer is rebuilt?" }]);
    });

    it("accepts a fence without a language and CRLF line ends", () => {
        expect(parseQuizText("```\r\nGET /health 200\r\n```")).toEqual([{ kind: "code", lang: "", code: "GET /health 200" }]);
    });
});

describe("splitInlineCode", () => {
    it("splits backtick spans", () => {
        expect(splitInlineCode("run `npm ci` first")).toEqual([
            { code: false, value: "run " },
            { code: true, value: "npm ci" },
            { code: false, value: " first" },
        ]);
    });
});
