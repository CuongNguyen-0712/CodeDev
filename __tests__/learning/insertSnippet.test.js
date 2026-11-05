import { describe, expect, it } from "vitest";

import { entryBodyStart } from "@/lib/challenges/entry";
import { insertSnippetText } from "@/lib/challenges/insertSnippet";

const insertAt = (text, marker, snippet) => {
    const at = text.indexOf("|");
    const clean = text.replace("|", "");
    return insertSnippetText(clean, at, at, snippet).text;
};

describe("insertSnippetText", () => {
    it("puts the snippet inside an empty function body (no caret yet)", () => {
        const source = "function f() {\n}\n";
        const at = entryBodyStart(source);
        const { text, caret } = insertSnippetText(source, at, at, "x();\ny();");
        expect(text).toBe("function f() {\n  x();\n  y();\n}\n");
        expect(text.slice(0, caret).endsWith("y();")).toBe(true);
    });

    it("goes above the first body line at its indent", () => {
        const source = "function f() {\n    return 1;\n}";
        const at = entryBodyStart(source);
        expect(insertSnippetText(source, at, at, "log();").text).toBe("function f() {\n    log();\n    return 1;\n}");
    });

    it("never splits a line: a caret inside code inserts on the next line", () => {
        expect(insertAt("  const a = |1;\n", "|", "b();")).toBe("  const a = 1;\n  b();\n");
    });

    it("fills a blank line at its indent", () => {
        expect(insertAt("{\n    |\n}", "|", "go();")).toBe("{\n    go();\n}");
    });

    it("replaces a selection and indents the following lines", () => {
        const text = "  return TODO;\n";
        const start = text.indexOf("TODO");
        expect(insertSnippetText(text, start, start + 4, "a\n+ b").text).toBe("  return a\n  + b;\n");
    });

    it("keeps CRLF text intact around the snippet", () => {
        expect(insertAt("  x = |1;\r\nnext\r\n", "|", "y();")).toBe("  x = 1;\n  y();\r\nnext\r\n");
    });
});
