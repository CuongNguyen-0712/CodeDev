// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/** The comment form's keyboard shortcut obeys the same rules as its button; the hooks are replaced. */
const add = { isPending: false, mutate: vi.fn() };
vi.mock("next-auth/react", () => ({ useSession: () => ({ status: "authenticated" }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));
vi.mock("@/mutations/blog.mutation", () => ({ useAddComment: () => add, useDeleteComment: () => ({ isPending: false, mutate: vi.fn() }) }));
vi.mock("@/queries/blog.query", () => ({ blogQueries: { comments: () => ({ queryKey: ["comments"] }), viewer: () => ({ queryKey: ["viewer"] }) } }));
vi.mock("@tanstack/react-query", () => ({
    useInfiniteQuery: () => ({ data: { pages: [{ items: [] }] }, isSuccess: true }),
    useQuery: () => ({ data: null }),
}));

const { default: PostComments } = await import("@/components/blog/postComments");

afterEach(() => { cleanup(); add.mutate.mockClear(); add.isPending = false; });

const box = () => screen.getByLabelText("Comment");
const ctrlEnter = () => fireEvent.keyDown(box(), { key: "Enter", ctrlKey: true });

describe("comment form", () => {
    it("Ctrl+Enter sends the trimmed text", () => {
        render(<PostComments postId="pst_a" slug="a-post" initialCount={0} />);
        fireEvent.change(box(), { target: { value: "  Nice post  " } });
        ctrlEnter();
        expect(add.mutate).toHaveBeenCalledTimes(1);
        expect(add.mutate.mock.calls[0][0]).toBe("Nice post");
    });

    it("Ctrl+Enter on an empty box sends nothing", () => {
        render(<PostComments postId="pst_a" slug="a-post" initialCount={0} />);
        ctrlEnter();
        fireEvent.change(box(), { target: { value: "   " } });
        ctrlEnter();
        expect(add.mutate).not.toHaveBeenCalled();
    });

    it("Ctrl+Enter while a comment is being sent does not send it twice", () => {
        add.isPending = true;
        render(<PostComments postId="pst_a" slug="a-post" initialCount={0} />);
        fireEvent.change(box(), { target: { value: "Nice post" } });
        ctrlEnter();
        expect(add.mutate).not.toHaveBeenCalled();
    });

    it("shows the counter only near the limit", () => {
        render(<PostComments postId="pst_a" slug="a-post" initialCount={0} />);
        fireEvent.change(box(), { target: { value: "x".repeat(100) } });
        expect(screen.queryByText("100/2000")).toBeNull();
        fireEvent.change(box(), { target: { value: "x".repeat(1700) } });
        expect(screen.getByText("1700/2000")).toBeTruthy();
    });
});
