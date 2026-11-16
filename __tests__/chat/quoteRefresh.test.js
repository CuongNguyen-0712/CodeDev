import { describe, expect, it } from "vitest";

import { patchMessage } from "@/lib/chat/messageCache";

/** A reply's quote follows its original when the original is edited or unsent (realtime or the sender's own write). */
const msg = (seq, extra = {}) => ({ id: `msg_${seq}`, seq: String(seq), clientId: `c${seq}`, body: `m${seq}`, ...extra });
const data = (...pages) => ({ pages: pages.map((items) => ({ items, nextCursor: null })), pageParams: pages.map(() => undefined) });
const quoted = (over = {}) => msg(9, { replyTo: { id: "msg_3", senderName: "Ada", preview: "m3", deleted: false }, ...over });

describe("quotes follow their original", () => {
    it("an unsent original blanks the quote in every reply", () => {
        const after = patchMessage(data([quoted(), msg(5)], [msg(3)]), msg(3, { deleted: true, body: "", attachments: [] }));
        expect(after.pages[0].items[0].replyTo).toEqual({ id: "msg_3", senderName: "Ada", preview: null, deleted: true });
    });

    it("an edited original refreshes the quote preview to 80 characters of the new body", () => {
        const after = patchMessage(data([quoted(), msg(5)], [msg(3)]), msg(3, { body: "x".repeat(100), editedAt: "2026-11-11T10:05:00Z" }));
        expect(after.pages[0].items[0].replyTo.preview).toBe("x".repeat(80));
        expect(after.pages[0].items[0].replyTo.deleted).toBe(false);
    });

    it("uses the inbox words for code and attachments, and leaves other replies alone", () => {
        const fence = "`".repeat(3);
        const code = patchMessage(data([quoted(), msg(5, { replyTo: { id: "msg_other", preview: "k" } })], [msg(3)]), msg(3, { body: `${fence}js\nx\n${fence}` }));
        expect(code.pages[0].items[0].replyTo.preview).toBe("[code]");
        expect(code.pages[0].items[1].replyTo.preview).toBe("k");
        const file = patchMessage(data([quoted()], [msg(3)]), msg(3, { body: "", attachments: [{ kind: "file" }] }));
        expect(file.pages[0].items[0].replyTo.preview).toBe("[file]");
    });
});
