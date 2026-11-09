// BlogMarkdown with the real CodeBlock (markdown.test.jsx mocks it): the header shows the file name and the language once.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import BlogMarkdown from "@/components/blog/markdown";

describe("BlogMarkdown code blocks", () => {
    it("renders one language label inside the lesson prose scope", () => {
        const html = renderToStaticMarkup(<BlogMarkdown body={"```js\nlet a = 1;\n```"} origins={[]} />);
        expect(html.startsWith('<div class="lesson-prose">')).toBe(true);
        expect(html.match(/class="code_language"/g)).toHaveLength(1);
        expect(html).toContain('<span class="code_language">JS</span>');
        expect(html).toContain('<span class="code_filename">main.js</span>');
    });
});
