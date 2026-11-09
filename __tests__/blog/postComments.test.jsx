import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "unauthenticated" }) }));
vi.mock("@tanstack/react-query", () => ({
    useInfiniteQuery: vi.fn(),
    useMutation: vi.fn(),
    useQueryClient: vi.fn(),
}));

import { CommentItem } from "@/components/blog/postComments";

const comment = {
    id: "c1",
    body: "**bold** <img src=x onerror=alert(1)>\nline 2",
    createdAt: new Date().toISOString(),
    author: { id: "u1", username: "ada", image: null },
    own: false,
};
const render = (props) => renderToStaticMarkup(<CommentItem comment={comment} onDelete={() => {}} {...props} />);

describe("CommentItem", () => {
    it("renders the body as plain text", () => {
        const html = render();
        expect(html).toContain("**bold**");
        expect(html).not.toContain("<img");
        expect(html).not.toContain("<strong");
        expect(html).toMatch(/whitespace-pre-wrap[^>]*>[^<]*\*\*bold\*\*[^<]*\nline 2/);
    });
    it("shows Delete only on own comments", () => {
        expect(render()).not.toContain("Delete");
        expect(render({ comment: { ...comment, own: true } })).toContain("Delete");
    });
});
