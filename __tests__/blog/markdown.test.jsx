import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BlogMarkdown, { isInternalHref } from "@/components/blog/markdown";

vi.mock("@/components/ui/codeBlock", () => ({
    default: ({ value }) => <pre data-lang={value.language}>{value.code}</pre>,
}));

const origins = ["https://res.cloudinary.com"];
const render = (body) => renderToStaticMarkup(<BlogMarkdown body={body} origins={origins} />);

describe("BlogMarkdown", () => {
    it("drops raw HTML", () => {
        expect(render("<script>alert(1)</script>")).not.toContain("<script");
    });
    it("drops javascript: links", () => {
        expect(render("[x](javascript:alert(1))")).not.toContain("javascript:");
    });
    it("renders images only from allowed origins", () => {
        expect(render("![a](https://evil.example/a.png)")).not.toContain("<img");
        const html = render("![a](https://res.cloudinary.com/a.png)");
        expect(html).toContain("<img");
        expect(html).toContain('loading="lazy"');
        expect(html).toContain("lesson_image");
    });
    it("marks external links ugc and leaves relative links alone", () => {
        expect(render("[site](https://example.com)")).toContain('rel="nofollow ugc noopener"');
        const rel = render("[a](/course/x) [b](#a)");
        expect(rel).not.toContain("target=");
        expect(rel).not.toContain("rel=");
    });
    it("blocks case-variant javascript: links and protocol-relative images", () => {
        expect(render("[x](JAVASCRIPT:alert(1))").toLowerCase()).not.toContain("javascript:");
        expect(render("![x](//evil.example/a.png)")).not.toContain("<img");
    });
    it("gives protocol-relative links the ugc rel", () => {
        expect(render("[x](//spam.example)")).toContain('rel="nofollow ugc noopener"');
    });
    it("treats a slash-backslash link as external (browsers read it as //host)", () => {
        // Markdown hands the link over as "/%5Cevil.example"; the raw form is checked on the helper.
        const html = render("[x](/\\evil.example)");
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="nofollow ugc noopener"');
        expect(isInternalHref("/\\evil.example")).toBe(false);
        expect(isInternalHref("//evil.example")).toBe(false);
        expect(isInternalHref("https://evil.example")).toBe(false);
        expect(isInternalHref("/course/x")).toBe(true);
        expect(isInternalHref("#a")).toBe(true);
    });
    it("wraps the body in the lesson prose container", () => {
        expect(render("## Title\n\ntext")).toMatch(/^<div class="lesson-prose"><div class="portable_text_container"><h2 id="title" class="lesson_h2 scroll-mt-20">Title<\/h2>/);
    });
    it("renders GFM tables", () => {
        expect(render("|a|b|\n|-|-|\n|1|2|")).toContain("<table");
    });
    it("uses CodeBlock for fenced code and plain code inline", () => {
        expect(render("```js\nlet a = 1;\n```")).toContain('data-lang="js"');
        expect(render("```\nfoo\n```")).toContain("<pre");
        const inline = render("use `x` here");
        expect(inline).toContain('<code class="lesson_inline_code">x</code>');
        expect(inline).not.toContain("<pre");
    });
});
