// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Feed and post-page actions with their real query hooks; the session, router, alert and API client are replaced.
 * Live counts come from the shared feed-state query, and a failed read never leaves a control disabled.
 */
const session = { status: "authenticated", data: { user: { id: "usr_me" } } };
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));

const api = { getFeedState: vi.fn(), getViewer: vi.fn() };
vi.mock("@/clients/blog.client", () => ({ blogClient: new Proxy({}, { get: (_, name) => (...args) => api[name]?.(...args) }) }));

const setPostLikeAction = vi.fn();
const addCommentAction = vi.fn();
vi.mock("@/actions/blog.actions", () => ({
    setPostLikeAction: (...args) => setPostLikeAction(...args),
    addCommentAction: (...args) => addCommentAction(...args),
}));

const { CommentButton, LikeButton, default: PostActions } = await import("@/components/blog/postActions");
const { useAddComment } = await import("@/mutations/blog.mutation");
const { blogKeys } = await import("@/keys/blog.keys");

afterEach(() => { cleanup(); Object.values(api).forEach((fn) => fn.mockReset()); setPostLikeAction.mockReset(); addCommentAction.mockReset(); });

const newClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui, client = newClient()) => render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const like = () => screen.getByRole("button", { name: /Like/ });

describe("feed actions", () => {
    it("Like and Comment show the live counts of the shared query", async () => {
        api.getFeedState.mockResolvedValue({ ids: ["pst_a"], counts: { pst_a: { likeCount: 7, commentCount: 3 } } });
        wrap(<>
            <LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={1} authorId="usr_other" />
            <CommentButton postId="pst_a" pageIds={["pst_a"]} slug="a-post" commentCount={0} />
        </>);
        await waitFor(() => expect(like().textContent).toBe("7"));
        expect(like().getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("link").textContent).toBe("3");
        expect(api.getFeedState).toHaveBeenCalledTimes(1);
    });

    it("your own post shows its likes as text, not as a button", async () => {
        api.getFeedState.mockResolvedValue({ ids: [], counts: { pst_a: { likeCount: 4, commentCount: 0 } } });
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={0} authorId="usr_me" />);
        await waitFor(() => expect(screen.getByText("4 likes on your post")).toBeTruthy());
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("Like stays enabled while its request is pending, and a second click sends nothing", async () => {
        api.getFeedState.mockResolvedValue({ ids: [], counts: { pst_a: { likeCount: 2, commentCount: 0 } } });
        let finish;
        setPostLikeAction.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={0} authorId="usr_other" />);
        await waitFor(() => expect(like().textContent).toBe("2"));

        fireEvent.click(like());
        await waitFor(() => expect(setPostLikeAction).toHaveBeenCalledTimes(1));
        // Optimistic and never dimmed: no `disabled`, which would drop the heart to half opacity.
        expect(like().disabled).toBe(false);
        expect(like().getAttribute("aria-pressed")).toBe("true");
        expect(like().textContent).toBe("3");

        fireEvent.click(like());
        expect(setPostLikeAction).toHaveBeenCalledTimes(1);
        await act(async () => finish({ success: true, data: { liked: true, likeCount: 3 } }));
    });

    it("a click before the feed state arrives does nothing", async () => {
        api.getFeedState.mockReturnValue(new Promise(() => { }));
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={2} authorId="usr_other" />);
        expect(like().disabled).toBe(false);
        fireEvent.click(like());
        expect(setPostLikeAction).not.toHaveBeenCalled();
        expect(like().getAttribute("aria-pressed")).toBe("false");
    });

    it("a failed feed read leaves Like not liked and enabled", async () => {
        api.getFeedState.mockRejectedValue(new Error("down"));
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={2} authorId="usr_other" />);
        await waitFor(() => expect(like().disabled).toBe(false));
        expect(like().getAttribute("aria-pressed")).toBe("false");
        expect(like().textContent).toBe("2");
    });

    it("a failed viewer read on the post page enables Like and shows Report", async () => {
        api.getViewer.mockRejectedValue(new Error("down"));
        wrap(<PostActions postId="pst_a" slug="a-post" title="A post" likeCount={2} commentCount={0} />);
        await waitFor(() => expect(screen.getByRole("button", { name: /Report/ })).toBeTruthy());
        expect(like().disabled).toBe(false);
        // The post page bar mirrors the feed bar: it has Share too.
        expect(screen.getByRole("button", { name: "Share" })).toBeTruthy();
    });

    it("a post you already reported shows Reported as text", async () => {
        api.getViewer.mockResolvedValue({ likeCount: 2, commentCount: 0, liked: false, reported: true, own: false });
        wrap(<PostActions postId="pst_a" slug="a-post" title="A post" likeCount={2} commentCount={0} />);
        await waitFor(() => expect(screen.getByText("Reported")).toBeTruthy());
        expect(screen.queryByRole("button", { name: /Report/ })).toBeNull();
    });
});

describe("useAddComment", () => {
    const comment = { id: "pcm_new", body: "Hi" };
    const run = async (client) => {
        addCommentAction.mockResolvedValue({ success: true, data: comment });
        const { result } = renderHook(() => useAddComment("pst_a"), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
        await act(() => result.current.mutateAsync("Hi"));
    };

    it("puts the comment on top of the cached first page", async () => {
        const client = newClient();
        client.setQueryData(blogKeys.comments("pst_a"), { pages: [{ items: [{ id: "pcm_old" }] }], pageParams: [undefined] });
        await run(client);
        expect(client.getQueryData(blogKeys.comments("pst_a")).pages[0].items.map((c) => c.id)).toEqual(["pcm_new", "pcm_old"]);
    });

    it("invalidates the list when nothing is cached", async () => {
        const client = newClient();
        const invalidate = vi.spyOn(client, "invalidateQueries");
        await run(client);
        expect(client.getQueryData(blogKeys.comments("pst_a"))).toBeUndefined();
        expect(invalidate).toHaveBeenCalledWith({ queryKey: blogKeys.comments("pst_a") });
    });
});
