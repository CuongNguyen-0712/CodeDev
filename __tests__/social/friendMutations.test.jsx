// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/actions/social.actions", () => ({
    sendFriendRequestAction: vi.fn(), respondFriendRequestAction: vi.fn(), cancelFriendRequestAction: vi.fn(), removeFriendAction: vi.fn(),
}));
vi.mock("@/lib/actionResult", () => ({ callAction: (run) => run() }));
const connected = vi.hoisted(() => ({ value: true }));
vi.mock("@/lib/pusherClient", () => ({ isPusherConnected: () => connected.value }));

import { cancelFriendRequestAction, respondFriendRequestAction, sendFriendRequestAction } from "@/actions/social.actions";
import { friendKeys } from "@/keys/friend.keys";
import { userKeys } from "@/keys/user.keys";
import { applyFriendChange } from "@/lib/social/friendCache";
import { useFriendAction } from "@/mutations/friend.mutation";

const person = (id) => ({ id, username: id, nickname: null, image: null, level: 1, levelTitle: "Newbie" });
const row = (id, friendship) => ({ ...person(id), friendship, rank: null, showProfile: true });
const pagesOf = (...items) => ({ pages: [{ items, nextCursor: null }], pageParams: [null] });
const ids = (key) => qc.getQueryData(key).pages.flatMap((p) => p.items.map((u) => u.id));
const friendshipOf = (id) => qc.getQueryData(userKeys.users("")).pages[0].items.find((u) => u.id === id).friendship;

let qc;
const wrapper = ({ children }) => createElement(QueryClientProvider, { client: qc }, children);
let fail;

beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    vi.clearAllMocks();
    connected.value = true;
    qc.setQueryData(userKeys.users(""), pagesOf(row("bob", "received"), row("cat", null), row("dan", "received")));
    qc.setQueryData(friendKeys.list(""), pagesOf(person("amy")));
    qc.setQueryData(friendKeys.invitations("received"), pagesOf(person("bob"), person("dan")));
    qc.setQueryData(friendKeys.counts(), { friends: 1, received: 2 });
    respondFriendRequestAction.mockReturnValue(new Promise((_, reject) => { fail = () => reject(new Error("409")); }));
});

describe("useFriendAction", () => {
    it("optimistic accept then server error restores only that row", async () => {
        const invalidate = vi.spyOn(qc, "invalidateQueries");
        const { result } = renderHook(() => useFriendAction(), { wrapper });
        act(() => { result.current.respond.mutate({ userId: "bob", accept: true }); });
        await vi.waitFor(() => expect(friendshipOf("bob")).toBe("friends"));
        expect(ids(friendKeys.list(""))).toEqual(["amy", "bob"]);
        expect(ids(friendKeys.invitations("received"))).toEqual(["dan"]);

        // Lands while the request runs: cat sends me a request.
        applyFriendChange(qc, { user: person("cat"), friendship: "received", previous: null });
        await act(async () => { fail(); await vi.waitFor(() => expect(result.current.respond.isError).toBe(true)); });

        expect(friendshipOf("bob")).toBe("received");
        expect(friendshipOf("cat")).toBe("received");
        expect(ids(friendKeys.list(""))).toEqual(["amy"]);
        expect(ids(friendKeys.invitations("received"))).toEqual(["bob", "cat", "dan"]);
        expect(qc.getQueryData(friendKeys.counts())).toEqual({ friends: 1, received: 3 });
        expect(invalidate.mock.calls.map(([f]) => f.queryKey)).toContainEqual(friendKeys.all);
    });

    it("a newer change to the same person survives the rollback", async () => {
        const { result } = renderHook(() => useFriendAction(), { wrapper });
        act(() => { result.current.respond.mutate({ userId: "bob", accept: true }); });
        await vi.waitFor(() => expect(friendshipOf("bob")).toBe("friends"));
        // Bob cancels his request meanwhile, so the accept fails.
        applyFriendChange(qc, { user: person("bob"), friendship: null, previous: "received" });
        await act(async () => { fail(); await vi.waitFor(() => expect(result.current.respond.isError).toBe(true)); });
        expect(friendshipOf("bob")).toBeNull();
    });

    it("applies the server's answer and leaves counts to the realtime event", async () => {
        // Cat had already sent me a request: the server answers with friends.
        sendFriendRequestAction.mockResolvedValue({ friendship: "friends", user: person("cat") });
        const { result } = renderHook(() => useFriendAction(), { wrapper });
        await act(async () => { await result.current.send.mutateAsync("cat"); });
        expect(sendFriendRequestAction).toHaveBeenCalledWith("cat");
        expect(friendshipOf("cat")).toBe("friends");
        expect(ids(friendKeys.list(""))).toEqual(["amy", "cat"]);
        expect(qc.getQueryData(friendKeys.counts())).toEqual({ friends: 1, received: 2 });
        expect(qc.getQueryState(friendKeys.counts()).isInvalidated).toBe(false);
    });

    it("refetches counts after success when realtime is down", async () => {
        connected.value = false;
        sendFriendRequestAction.mockResolvedValue({ friendship: "sent", user: person("cat") });
        const { result } = renderHook(() => useFriendAction(), { wrapper });
        await act(async () => { await result.current.send.mutateAsync("cat"); });
        expect(friendshipOf("cat")).toBe("sent");
        expect(qc.getQueryState(friendKeys.counts()).isInvalidated).toBe(true);
    });

    it("a later action does not drop the recovery refetch, nor an in-flight counts refetch", async () => {
        const invitationsFn = vi.fn()
            .mockImplementationOnce(() => new Promise(() => { })) // cancelled by the next action
            .mockResolvedValue({ items: [person("bob"), person("dan")], nextCursor: null });
        let settleCounts;
        const countsFn = vi.fn(() => new Promise((resolve) => { settleCounts = resolve; }));
        const { result } = renderHook(() => {
            useInfiniteQuery({
                queryKey: friendKeys.invitations("received"), queryFn: invitationsFn,
                initialPageParam: null, getNextPageParam: () => undefined, staleTime: Infinity,
            });
            useQuery({ queryKey: friendKeys.counts(), queryFn: countsFn, staleTime: Infinity });
            return useFriendAction();
        }, { wrapper });

        act(() => { result.current.respond.mutate({ userId: "bob", accept: true }); });
        await vi.waitFor(() => expect(friendshipOf("bob")).toBe("friends"));
        await act(async () => { fail(); await vi.waitFor(() => expect(result.current.respond.isError).toBe(true)); });
        await vi.waitFor(() => expect(invitationsFn).toHaveBeenCalledTimes(1));
        expect(countsFn).toHaveBeenCalledTimes(1);

        cancelFriendRequestAction.mockResolvedValue({ friendship: null, user: person("cat") });
        await act(async () => { await result.current.cancel.mutateAsync("cat"); });

        await vi.waitFor(() => expect(qc.getQueryState(friendKeys.invitations("received")).isInvalidated).toBe(false));
        expect(invitationsFn).toHaveBeenCalledTimes(2);
        expect(qc.getQueryState(friendKeys.counts()).fetchStatus).toBe("fetching");
        await act(async () => { settleCounts({ friends: 1, received: 2 }); });
        await vi.waitFor(() => expect(qc.getQueryState(friendKeys.counts()).isInvalidated).toBe(false));
        expect(countsFn).toHaveBeenCalledTimes(1);
    });
});
