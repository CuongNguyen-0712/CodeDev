import { describe, expect, it } from "vitest";

import { applyMarkdown } from "@/lib/blog/markdownInsert.mjs";

// `|` marks the selection in these strings: "a|b|c" selects "b"; "a||c" is the caret between a and c.
const sel = (marked) => {
    const start = marked.indexOf("|");
    const end = marked.indexOf("|", start + 1) - 1;
    return { text: marked.replace(/\|/g, ""), start, end };
};
const run = (action, marked) => {
    const { text, start, end } = sel(marked);
    const out = applyMarkdown(action, text, start, end);
    return out.text.slice(0, out.start) + "|" + out.text.slice(out.start, out.end) + "|" + out.text.slice(out.end);
};

describe("applyMarkdown", () => {
    it("wraps the selection in bold, or inserts a selected placeholder", () => {
        expect(run("bold", "a |word| b")).toBe("a **|word|** b");
        expect(run("bold", "a || b")).toBe("a **|bold text|** b");
    });

    it("wraps inline code", () => {
        expect(run("code", "run |npm test|")).toBe("run `|npm test|`");
    });

    it("turns the current line into a heading, replacing an existing level, caret at the end", () => {
        expect(run("h2", "intro\nTi|tle|\nend")).toBe("intro\n## Title||\nend");
        expect(run("h3", "|## Title|")).toBe("### Title||");
        // On an empty line the writer types straight after the marker.
        expect(run("h4", "||")).toBe("#### ||");
    });

    it("makes every selected line a list item once", () => {
        expect(run("list", "|one\ntwo|")).toBe("- one\n- two||");
        expect(run("list", "|- one\ntwo|")).toBe("- one\n- two||");
    });

    it("links the selection and selects the URL to type", () => {
        expect(run("link", "see |docs|")).toBe("see [docs](|https://|)");
        expect(run("link", "see ||")).toBe("see [|text|](https://)");
    });

    it("puts a named code block on lines of its own", () => {
        expect(run("codeblock", "before||")).toBe("before\n```js app.js\n|code|\n```");
        expect(run("codeblock", "|let a = 1|\nafter")).toBe("```js app.js\n|let a = 1|\n```\nafter");
    });
});
