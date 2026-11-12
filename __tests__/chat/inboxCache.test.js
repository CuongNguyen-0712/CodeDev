import { describe, expect, it } from "vitest";

import { applyIncoming, markRowRead, patchRowPreview } from "@/lib/chat/inboxCache";

const row = (id, extra = {}) => ({ id, kind: "direct", title: id, image: null, state: "active", lastMessage: { seq: "1", preview: "old", senderId: "u2", createdAt: "t0" }, lastMessageAt: "t0", unread: false, ...extra });
const inbox = (...items) => ({ pages: [{ items, nextCursor: "c" }, { items: [row("far")], nextCursor: null }], pageParams: [undefined, "c"] });
const msg = (extra = {}) => ({ conversationId: "b", seq: "2", preview: "new", senderId: "u2", createdAt: "t1", ...extra });
const ME = { meId: "me", openId: null };

describe("applyIncoming", () => {
    it("moves a cached conversation to the top and marks it unread", () => {
        const data = inbox(row("a"), row("b"));
        const snapshot = JSON.stringify(data);
        const r = applyIncoming(data, msg(), ME);
        expect(r).toMatchObject({ found: true, becameUnread: true });
        expect(r.data.pages[0].items.map((x) => x.id)).toEqual(["b", "a"]);
        expect(r.data.pages[0].items[0]).toMatchObject({ unread: true, lastMessageAt: "t1", lastMessage: { seq: "2", preview: "new", senderId: "u2", createdAt: "t1" } });
        expect(JSON.stringify(data)).toBe(snapshot);
    });
    it("moves a row from a later page to the top of the first", () => {
        const r = applyIncoming(inbox(row("a")), msg({ conversationId: "far" }), ME);
        expect(r.data.pages[0].items.map((x) => x.id)).toEqual(["far", "a"]);
        expect(r.data.pages[1].items).toEqual([]);
    });
    it("does not mark the open, visible conversation unread", () => {
        const r = applyIncoming(inbox(row("b")), msg(), { meId: "me", openId: "b" });
        expect(r.data.pages[0].items[0]).toMatchObject({ unread: false, lastMessage: { seq: "2" } });
        expect(r.becameUnread).toBe(false);
    });
    it("own message from another tab updates the row but not unread", () => {
        const r = applyIncoming(inbox(row("b")), msg({ senderId: "me" }), ME);
        expect(r.data.pages[0].items[0]).toMatchObject({ unread: false, lastMessage: { seq: "2", senderId: "me" } });
        expect(r.becameUnread).toBe(false);
    });
    it("reports becameUnread only when the row turns unread", () => {
        const first = applyIncoming(inbox(row("b")), msg(), ME);
        const second = applyIncoming(first.data, msg({ seq: "3" }), ME);
        expect(first.becameUnread).toBe(true);
        expect(second).toMatchObject({ found: true, becameUnread: false });
        expect(second.data.pages[0].items[0].unread).toBe(true);
    });
    it("ignores a redelivered or older event", () => {
        const data = inbox(row("b"));
        const r = applyIncoming(data, msg({ seq: "1" }), ME);
        expect(r.data).toBe(data);
        expect(r).toMatchObject({ found: true, becameUnread: false });
    });
    it("orders seq numerically: 10 arrives after 9", () => {
        const data = inbox(row("b", { lastMessage: { seq: "9", preview: "p", senderId: "u2", createdAt: "t" } }));
        const r = applyIncoming(data, msg({ seq: "10" }), ME);
        expect(r.data.pages[0].items[0].lastMessage.seq).toBe("10");
        expect(applyIncoming(r.data, msg({ seq: "9" }), ME).data).toBe(r.data);
    });
    it("reports not found for a seq it cannot read, leaving data alone", () => {
        const data = inbox(row("b"));
        const r = applyIncoming(data, msg({ seq: "abc" }), ME);
        expect(r.data).toBe(data);
        expect(r).toMatchObject({ found: false, becameUnread: false });
        expect(applyIncoming(data, msg({ seq: undefined }), ME).found).toBe(false);
    });
    it("never invents a row", () => {
        const data = inbox(row("a"));
        expect(applyIncoming(data, msg(), ME).data).toBe(data);
        expect(applyIncoming(data, msg(), ME).found).toBe(false);
        expect(applyIncoming(undefined, msg(), ME)).toEqual({ data: undefined, found: false, becameUnread: false });
    });
});

describe("markRowRead", () => {
    it("clears unread once and reports wasUnread; a read row keeps the same data", () => {
        const data = inbox(row("a", { unread: true }), row("b"));
        const r = markRowRead(data, "a", "1");
        expect(r.wasUnread).toBe(true);
        expect(r.data.pages[0].items.map((x) => [x.id, x.unread])).toEqual([["a", false], ["b", false]]);
        expect(data.pages[0].items[0].unread).toBe(true);
        expect(markRowRead(r.data, "a", "1")).toMatchObject({ data: r.data, wasUnread: false, found: true });
        expect(markRowRead(data, "zzz", "1")).toEqual({ data, wasUnread: false, found: false });
    });
    it("keeps the row unread when a newer message arrived than the read seq", () => {
        const data = inbox(row("a", { unread: true, lastMessage: { seq: "6", preview: "p", senderId: "u2", createdAt: "t" } }));
        expect(markRowRead(data, "a", "5")).toMatchObject({ data, wasUnread: false, found: true });
        expect(markRowRead(data, "a", "6").wasUnread).toBe(true);
        expect(markRowRead(data, "a", "10").wasUnread).toBe(true);
    });
});

describe("patchRowPreview", () => {
    it("changes the preview only when seq is the row's last message", () => {
        const data = inbox(row("a", { lastMessage: { seq: "5", preview: "old", senderId: "u2", createdAt: "t" } }));
        const patched = patchRowPreview(data, "a", { seq: "5", preview: "edited" });
        expect(patched.pages[0].items[0].lastMessage).toMatchObject({ seq: "5", preview: "edited" });
        expect(data.pages[0].items[0].lastMessage.preview).toBe("old");
        expect(patched).not.toBe(data);
        expect(patchRowPreview(data, "a", { seq: "4", preview: "x" })).toBe(data);
        expect(patchRowPreview(data, "nope", { seq: "5", preview: "x" })).toBe(data);
    });
});
