import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BlogMarkdown from "@/components/blog/markdown";
import { extractHeadings } from "@/lib/blog/text.mjs";

vi.mock("@/components/ui/codeBlock", () => ({
    default: ({ value }) => <pre data-lang={value.language}>{value.code}</pre>,
}));

const origins = ["https://res.cloudinary.com"];
const render = (body) => renderToStaticMarkup(<BlogMarkdown body={body} origins={origins} />);

describe("BlogMarkdown layout", () => {
    it("never nests a <figure> inside a <p> (hydration error)", () => {
        const html = render("Before ![a](https://res.cloudinary.com/a.png) after\n\n![b](https://res.cloudinary.com/b.png)");
        expect(html).toContain("<figure");
        expect(html).not.toMatch(/<p[^>]*>(?:(?!<\/p>).)*<figure/s);
    });

    it("gives h2/h3 the same ids the table of contents uses", () => {
        const body = "## Đánh index\n\ntext\n\n### `EXPLAIN` **plan**\n\n## Đánh index\n\n#### Not listed";
        const headings = extractHeadings(body);
        expect(headings).toEqual([
            { depth: 2, id: "danh-index", text: "Đánh index" },
            { depth: 3, id: "explain-plan", text: "EXPLAIN plan" },
            { depth: 2, id: "danh-index-1", text: "Đánh index" },
        ]);
        const html = render(body);
        for (const { id } of headings) expect(html).toContain(`id="${id}"`);
        expect(html).not.toMatch(/<h4[^>]* id=/);
    });
});
