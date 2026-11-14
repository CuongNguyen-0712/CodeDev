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

    it("shows the file name the fence gives", () => {
        const named = (fence) => /class="code_filename">([^<]*)</.exec(renderToStaticMarkup(<BlogMarkdown body={`${fence}\nx = 1\n\`\`\``} origins={[]} />))?.[1];
        expect(named("```js app.js")).toBe("app.js");
        expect(named('```js title="src/app.js"')).toBe("src/app.js");
        expect(named("```query.sql")).toBe("query.sql");
    });

    it("an empty fence is an empty block, not the word undefined", () => {
        const html = renderToStaticMarkup(<BlogMarkdown body={"```js\n```"} origins={[]} />);
        expect(html).toContain('class="code_filename">main.js<');
        expect(html).not.toContain("undefined");
    });
});
