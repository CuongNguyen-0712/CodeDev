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

    it("captions an image with its name, never with the editor's placeholder", () => {
        const html = render("![query plan](https://res.cloudinary.com/a.png)\n\n![image](https://res.cloudinary.com/b.png)\n\n![](https://res.cloudinary.com/c.png)");
        expect(html.match(/<figcaption/g)).toHaveLength(1);
        expect(html).toContain(">query plan</figcaption>");
        // No grey frame around the picture any more.
        expect(html).not.toContain("bg-muted");
    });

    it("styles h5 and h6 like the smallest heading", () => {
        const html = render("##### Five\n\n###### Six");
        expect(html).toContain('<h5 class="lesson_h4">Five</h5>');
        expect(html).toContain('<h6 class="lesson_h4">Six</h6>');
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
