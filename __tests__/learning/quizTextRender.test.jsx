// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";

import QuizText from "@/components/learning/[id]/challenges/quizText";

afterEach(cleanup);

describe("QuizText", () => {
    it("renders fenced evidence with the lesson code block", () => {
        const { container } = render(<QuizText text={"The config:\n\n```nginx\nlocation /api/ {\n    proxy_pass http://api/;\n}\n```\n\nStatement: \"It strips /api\""} />);
        const block = container.querySelector(".lesson-prose .code_block");
        expect(block).toBeTruthy();
        expect(block.textContent).toContain("proxy_pass http://api/;");
        expect(container.textContent).toContain("Statement: \"It strips /api\"");
    });

    it("keeps the line breaks and columns of legacy evidence", () => {
        const { container } = render(<QuizText text={"Token counts:\n\nlang  words\nen    96\n\nStatement: \"x\""} />);
        expect(container.querySelector("pre").textContent).toBe("lang  words\nen    96");
    });

    it("uses only phrasing elements inside an option button", () => {
        const { container } = render(<button><QuizText inline text={"```c\nint x = 1;\n```"} /></button>);
        expect(container.querySelector("button div, button pre, button p")).toBeNull();
        expect(container.querySelector("button span.whitespace-pre").textContent).toBe("int x = 1;");
    });
});
