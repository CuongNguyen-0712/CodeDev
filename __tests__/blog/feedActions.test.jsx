// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Feed and post-page actions with their real query hooks; the session, router, alert and API client are replaced.
 * Live counts come from the shared feed-state query, and a failed read never leaves a control disabled.
 */
const session = { status: "authenticated", data: { user: { id: "usr_me" } } };
vi.mock("next-auth/react", () => ({ useSession: () => session }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert: vi.fn() }) }));

const api = { getFeedState: vi.fn(), getViewer: vi.fn(), addComment: vi.fn() };
vi.mock("@/clients/blog.client", () => ({ blogClient: new Proxy({}, { get: (_, name) => (...args) => api[name]?.(...args) }) }));

const { CommentButton, LikeButton, default: PostActions } = await import("@/components/blog/postActions");
const { useAddComment } = await import("@/mutations/blog.mutation");
const { blogKeys } = await import("@/keys/blog.keys");

afterEach(() => { cleanup(); Object.values(api).forEach((fn) => fn.mockReset()); });

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
        await waitFor(() => expect(like().textContent).toBe("Like 7"));
        expect(like().getAttribute("aria-pressed")).toBe("true");
        expect(screen.getByRole("link").textContent).toBe("Comment 3");
        expect(api.getFeedState).toHaveBeenCalledTimes(1);
    });

    it("Like is disabled on your own post", async () => {
        api.getFeedState.mockResolvedValue({ ids: [], counts: {} });
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={0} authorId="usr_me" />);
        await waitFor(() => expect(api.getFeedState).toHaveBeenCalled());
        expect(like().disabled).toBe(true);
    });

    it("a failed feed read leaves Like not liked and enabled", async () => {
        api.getFeedState.mockRejectedValue(new Error("down"));
        wrap(<LikeButton postId="pst_a" pageIds={["pst_a"]} likeCount={2} authorId="usr_other" />);
        await waitFor(() => expect(like().disabled).toBe(false));
        expect(like().getAttribute("aria-pressed")).toBe("false");
        expect(like().textContent).toBe("Like 2");
    });

    it("a failed viewer read on the post page enables Like and shows Report", async () => {
        api.getViewer.mockRejectedValue(new Error("down"));
        wrap(<PostActions postId="pst_a" likeCount={2} commentCount={0} />);
        await waitFor(() => expect(screen.getByRole("button", { name: /Report/ })).toBeTruthy());
        expect(like().disabled).toBe(false);
    });
});

describe("useAddComment", () => {
    const comment = { id: "pcm_new", body: "Hi" };
    const run = async (client) => {
        api.addComment.mockResolvedValue(comment);
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
