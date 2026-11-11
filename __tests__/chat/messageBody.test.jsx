// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import MessageBody from "@/components/chat/messageBody";

/** Message text: plain paragraphs, code and bare links only (spec section 9). */
afterEach(cleanup);

describe("MessageBody", () => {
    it("renders HTML, markdown images and links as text", () => {   // Review Focus 2
        render(<MessageBody body={'<script>x</script> ![a](http://e/x.png) [l](http://e)'} />);
        expect(document.querySelector("script, img")).toBeNull();
        expect(screen.queryByRole("link", { name: "l" })).toBeNull();
    });

    it("keeps a markdown link's text, without the link", () => {
        const { container } = render(<MessageBody body="[label](http://e) and ![alt](http://e/x.png)" />);
        expect(container.querySelector("a, img")).toBeNull();
        expect(container.textContent).toContain("label and");
    });

    it("drops headings, lists and emphasis to their text", () => {
        const { container } = render(<MessageBody body={"# Title\n\n- item\n\n**bold**"} />);
        expect(container.querySelector("h1, ul, li, strong")).toBeNull();
        expect(container.textContent).toContain("Title");
        expect(container.textContent).toContain("bold");
    });

    it("highlights fenced code", () => {
        const { container } = render(<MessageBody body={"```js\nconst a = 1;\n```"} />);
        expect(container.querySelector(".code_block")).not.toBeNull();
        expect(container.querySelector(".token")).not.toBeNull();
        expect(container.textContent).toContain("const a = 1;");
    });

    it("keeps inline code inline", () => {
        const { container } = render(<MessageBody body={"run `npm test` now"} />);
        expect(container.querySelector(".code_block")).toBeNull();
        expect(container.querySelector("p code").textContent).toBe("npm test");
    });

    it("autolinks bare URLs with safe rel", () => {
        render(<MessageBody body="see https://example.com/a?b=1, thanks" />);
        const link = screen.getByRole("link", { name: "https://example.com/a?b=1" });
        expect(link.getAttribute("href")).toBe("https://example.com/a?b=1");
        expect(link.getAttribute("target")).toBe("_blank");
        expect(link.getAttribute("rel")).toBe("noopener noreferrer nofollow");
    });

    it("never links a javascript: URL", () => {
        render(<MessageBody body="javascript:alert(1) <javascript:alert(1)>" />);
        expect(screen.queryByRole("link")).toBeNull();
    });
});
