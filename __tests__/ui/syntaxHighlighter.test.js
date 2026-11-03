import { describe, expect, it } from "vitest";

import { highlightToHtml } from "@/lib/syntaxHighlighter";

describe("highlightToHtml", () => {
    it("colours tokens with the theme and escapes the source", () => {
        const html = highlightToHtml("const a = '<b>' && 1; // x", "javascript");
        expect(html).toContain('<span style="color:var(--syntax-keyword)">const</span>');
        expect(html).toContain("&lt;b&gt;");
        expect(html).not.toContain("<b>");
        expect(html).toContain("font-style:italic"); // comment
    });

    it("keeps the exact text, so the layer lines up with the textarea", () => {
        const code = "function f() {\n  return `a ${1}`;\n}\n";
        const text = highlightToHtml(code, "javascript").replace(/<[^>]+>/g, "")
            .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
        expect(text).toBe(code);
    });

    it("returns escaped plain text for a language that is not registered", () => {
        expect(highlightToHtml("<x>", "not-a-language")).toBe("&lt;x&gt;");
        expect(highlightToHtml("<x>", "")).toBe("&lt;x&gt;");
    });
});
