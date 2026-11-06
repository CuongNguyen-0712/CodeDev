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

    it("replaces the whole lines a selection touches, at the first line's indent", () => {
        const text = "function f() {\n  const a = 1;\n  if (a > 2) {\n    run();\n  }\n  return a;\n}\n";
        const start = text.indexOf("> 2"); // mid-line selection of the faulty `if` block
        const end = text.indexOf("  }") + 2;
        const fix = "if (a >= 2) {\n  run();\n}";
        const out = insertSnippetText(text, start, end, fix);
        expect(out.text).toBe("function f() {\n  const a = 1;\n  if (a >= 2) {\n    run();\n  }\n  return a;\n}\n");
        expect(out.text.slice(0, out.caret).endsWith("  }")).toBe(true);
    });

    it("leaves out the line where a selection ends at column 0", () => {
        const text = "a();\nb();\nc();\n";
        expect(insertSnippetText(text, 0, text.indexOf("c();"), "x();").text).toBe("x();\nc();\n");
    });

    it("keeps CRLF text intact around the snippet", () => {
        expect(insertAt("  x = |1;\r\nnext\r\n", "|", "y();")).toBe("  x = 1;\n  y();\r\nnext\r\n");
    });
});
