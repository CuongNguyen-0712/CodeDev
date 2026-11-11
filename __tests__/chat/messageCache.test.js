import { describe, expect, it } from "vitest";

import { insertMessage, optimisticMessage, patchMessage, setMessageStatus } from "@/lib/chat/messageCache";

const msg = (seq, extra = {}) => ({ id: `msg_${seq}`, seq: String(seq), clientId: `c${seq}`, body: `m${seq}`, ...extra });
const data = (...pages) => ({ pages: pages.map((items) => ({ items, nextCursor: null })), pageParams: pages.map(() => undefined) });

describe("insertMessage", () => {
    it("puts the message first on the first page (newest first)", () => {
        const before = data([msg(5), msg(4)], [msg(3)]);
        const after = insertMessage(before, msg(6));
        expect(after.pages[0].items.map((m) => m.seq)).toEqual(["6", "5", "4"]);
        expect(after.pages[1].items).toBe(before.pages[1].items);
        expect(before.pages[0].items).toHaveLength(2); // not mutated
    });

    it("ignores a message already in the cache", () => {
        const before = data([msg(5)], [msg(3)]);
        expect(insertMessage(before, msg(3))).toBe(before);
    });

    it("replaces the optimistic copy by clientId", () => {
        const opt = optimisticMessage({ clientId: "abc", body: "hi", sender: { id: "u1" }, conversationId: "cnv_1" });
        const before = data([opt, msg(5)]);
        const after = insertMessage(before, msg(6, { clientId: "abc" }));
        expect(after.pages[0].items.map((m) => m.seq)).toEqual(["6", "5"]);
    });

    it("returns data unchanged when no pages are cached", () => {
        expect(insertMessage(undefined, msg(1))).toBeUndefined();
        const empty = { pages: [], pageParams: [] };
        expect(insertMessage(empty, msg(1))).toBe(empty);
    });
});

describe("patchMessage", () => {
    it("replaces by id on any page", () => {
        const after = patchMessage(data([msg(5)], [msg(3)]), msg(3, { body: "edited" }));
        expect(after.pages[1].items[0].body).toBe("edited");
    });
    it("returns data unchanged when nothing matches", () => {
        const before = data([msg(5)]);
        expect(patchMessage(before, msg(9))).toBe(before);
        expect(patchMessage(undefined, msg(9))).toBeUndefined();
    });
});

describe("optimistic messages", () => {
    it("has the sending shape", () => {
        const m = optimisticMessage({ clientId: "abc", body: "hi", sender: { id: "u1" }, conversationId: "cnv_1" });
        expect(m).toMatchObject({ id: null, seq: null, clientId: "abc", conversationId: "cnv_1", body: "hi", attachments: [], editedAt: null, deleted: false, status: "sending" });
        expect(typeof m.createdAt).toBe("string");
    });
    it("marks one failed by clientId", () => {
        const opt = optimisticMessage({ clientId: "abc", body: "hi", sender: {}, conversationId: "c" });
        const failed = setMessageStatus(data([opt]), "abc", "failed");
        expect(failed.pages[0].items[0].status).toBe("failed");
    });
});
