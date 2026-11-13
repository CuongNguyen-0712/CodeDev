import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

import { friendKeys } from "@/keys/friend.keys";
import { userKeys } from "@/keys/user.keys";
import {
    applyFriendChange, patchCounts, patchFriendList, patchInvitations, patchUserPages,
} from "@/lib/social/friendCache";

const person = (id, username = id) => ({ id, username, nickname: null, image: null, level: 1, levelTitle: "Newbie" });
const pagesOf = (...pages) => ({
    pages: pages.map((items, n) => ({ items, nextCursor: n < pages.length - 1 ? `c${n}` : null })),
    pageParams: pages.map((_, n) => (n ? `c${n - 1}` : null)),
});
const ids = (data) => data.pages.map((p) => p.items.map((u) => u.id));
const change = (id, friendship, previous, username = id) => ({ user: person(id, username), friendship, previous });

describe("patchFriendList", () => {
    it("inserts a new friend in username order into a fully loaded list", () => {
        const data = pagesOf([person("amy"), person("cat")], [person("dan")]);
        const snapshot = JSON.stringify(data);
        expect(ids(patchFriendList(data, change("bob", "friends", "received")))).toEqual([["amy", "bob", "cat"], ["dan"]]);
        expect(ids(patchFriendList(data, change("zed", "friends", "sent")))).toEqual([["amy", "cat"], ["dan", "zed"]]);
        expect(ids(patchFriendList(pagesOf([]), change("bob", "friends", "sent")))).toEqual([["bob"]]);
        expect(JSON.stringify(data)).toBe(snapshot);
    });
    it("returns null when a page is left to load, even inside the loaded range", () => {
        const partial = { pages: [{ items: [person("amy"), person("cat")], nextCursor: "c0" }], pageParams: [null] };
        expect(patchFriendList(partial, change("bob", "friends", "received"))).toBeNull();
        expect(patchFriendList(partial, change("zed", "friends", "sent"))).toBeNull();
        expect(ids(patchFriendList(partial, change("amy", null, "friends")))).toEqual([["cat"]]);
    });
    it("leaves a searched list alone when the new friend does not match the search", () => {
        const data = pagesOf([person("amy")]);
        expect(patchFriendList(data, change("bob", "friends", "received"), "am")).toBe(data);
        expect(ids(patchFriendList(data, change("Sam", "friends", "received"), "AM"))).toEqual([["Sam", "amy"]]);
    });
    it("keeps the same data when nothing changes", () => {
        const data = pagesOf([person("amy")]);
        expect(patchFriendList(data, change("amy", "friends", "received"))).toBe(data);
        expect(patchFriendList(data, change("bob", null, "sent"))).toBe(data);
    });
});

describe("cache helpers", () => {
    it("accept moves the user from received to friends and adjusts both counts", () => {
        const accept = change("bob", "friends", "received");
        expect(ids(patchInvitations(pagesOf([person("ann"), person("bob")]), "received", accept))).toEqual([["ann"]]);
        expect(ids(patchFriendList(pagesOf([person("amy"), person("cat")]), accept))).toEqual([["amy", "bob", "cat"]]);
        expect(patchCounts({ friends: 2, received: 3 }, accept)).toEqual({ friends: 3, received: 2 });
    });

    it("send adds to sent, cancel removes from sent, remove drops from friends", () => {
        const sent = pagesOf([person("old")], [person("older")]);
        const afterSend = patchInvitations(sent, "sent", change("bob", "sent", null));
        expect(ids(afterSend)).toEqual([["bob", "old"], ["older"]]);
        const received = pagesOf([person("ann")]);
        expect(patchInvitations(received, "received", change("bob", "sent", null))).toBe(received);
        expect(ids(patchInvitations(afterSend, "sent", change("bob", null, "sent")))).toEqual([["old"], ["older"]]);
        expect(ids(patchFriendList(pagesOf([person("amy")], [person("bob")]), change("bob", null, "friends")))).toEqual([["amy"], []]);
        expect(patchCounts({ friends: 2, received: 0 }, change("bob", null, "friends"))).toEqual({ friends: 1, received: 0 });
        expect(patchCounts({ friends: 2, received: 0 }, change("bob", "sent", null))).toEqual({ friends: 2, received: 0 });
    });

    it("every page of every people search gets the new friendship", () => {
        const row = (id) => ({ ...person(id), friendship: null, rank: { tier: "gold" }, showProfile: true });
        const first = pagesOf([row("amy"), row("bob")], [row("cat"), row("bob")]);
        const next = patchUserPages(first, change("bob", "received", null));
        expect(next.pages.flatMap((p) => p.items).filter((u) => u.id === "bob")).toEqual([
            { ...row("bob"), friendship: "received" }, { ...row("bob"), friendship: "received" },
        ]);
        expect(next.pages[0].items[0]).toBe(first.pages[0].items[0]);
        expect(patchUserPages(next, change("bob", "received", null))).toBe(next);
        expect(patchUserPages(first, change("zed", "friends", "sent"))).toBe(first);
    });

    it("counts never go below zero", () => {
        expect(patchCounts({ friends: 0, received: 0 }, change("bob", "friends", "received"))).toEqual({ friends: 1, received: 0 });
        expect(patchCounts({ friends: 0, received: 0 }, change("bob", null, "friends"))).toEqual({ friends: 0, received: 0 });
    });

    it("a change for a list that is not loaded returns null", () => {
        const accept = change("bob", "friends", "received");
        expect(patchFriendList(undefined, accept)).toBeNull();
        expect(patchInvitations(undefined, "received", accept)).toBeNull();
        expect(patchCounts(undefined, accept)).toBeNull();
    });
});

describe("applyFriendChange", () => {
    it("patches every friend and people-search query and invalidates the ones it cannot patch", () => {
        const qc = new QueryClient();
        const spy = vi.spyOn(qc, "invalidateQueries");
        const row = (id, friendship) => ({ ...person(id), friendship, rank: null, showProfile: true });
        qc.setQueryData(friendKeys.list(""), pagesOf([person("amy")]));
        qc.setQueryData(friendKeys.list("zz"), pagesOf([]));
        qc.setQueryData(friendKeys.invitations("received"), pagesOf([person("bob")]));
        qc.setQueryData(friendKeys.counts(), { friends: 1, received: 1 });
        qc.setQueryData(userKeys.users(""), pagesOf([row("bob", "received")]));
        qc.setQueryData(userKeys.users("b"), pagesOf([row("bob", "received")]));
        // Loaded friends with more pages and bob past the last row: cannot place him.
        qc.setQueryData(friendKeys.list("b"), { pages: [{ items: [person("abby")], nextCursor: "c0" }], pageParams: [null] });

        applyFriendChange(qc, change("bob", "friends", "received"));

        expect(ids(qc.getQueryData(friendKeys.list("")))).toEqual([["amy", "bob"]]);
        expect(ids(qc.getQueryData(friendKeys.list("zz")))).toEqual([[]]);
        expect(ids(qc.getQueryData(friendKeys.invitations("received")))).toEqual([[]]);
        expect(qc.getQueryData(friendKeys.counts())).toEqual({ friends: 2, received: 0 });
        expect(qc.getQueryData(userKeys.users(""))).toMatchObject({ pages: [{ items: [{ id: "bob", friendship: "friends" }] }] });
        expect(qc.getQueryData(userKeys.users("b"))).toMatchObject({ pages: [{ items: [{ id: "bob", friendship: "friends" }] }] });
        expect(spy.mock.calls.map(([filters]) => filters.queryKey)).toEqual([friendKeys.list("b")]);
    });
});
