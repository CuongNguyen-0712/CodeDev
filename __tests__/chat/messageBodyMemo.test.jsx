// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

const markdown = vi.fn(({ children }) => <p>{children}</p>);
vi.mock("react-markdown", () => ({ default: (props) => markdown(props) }));
vi.mock("@/components/ui/codeBlock", () => ({ default: () => null }));

const { default: MessageBody } = await import("@/components/chat/messageBody");

afterEach(cleanup);

describe("MessageBody memo", () => {
    it("does not render the markdown again for an equal body", () => {
        const { rerender } = render(<MessageBody body="same" />);
        rerender(<MessageBody body="same" />);
        expect(markdown).toHaveBeenCalledTimes(1);
        rerender(<MessageBody body="other" />);
        expect(markdown).toHaveBeenCalledTimes(2);
    });
});
