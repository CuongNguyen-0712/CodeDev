import { describe, expect, it } from "vitest";

import { messageToast } from "@/lib/chat/messageToast";

/** The new-message toast outside /messages (spec section 4.7). */
const accepted = (over = {}) => ({
    conversationId: "cnv_1", conversationKind: "direct", title: "Ada", preview: "hello there",
    message: { id: "msg_1", sender: { id: "u_ada", username: "ada" } }, ...over,
});
const at = (pathname, payload, over = {}) => messageToast({ pathname, visible: true, meId: "u_me", payload, ...over });

describe("messageToast", () => {
    it("is null on /messages and its sub-pages", () => {
        expect(at("/messages", accepted())).toBeNull();
        expect(at("/messages/cnv_1", accepted())).toBeNull();
        expect(at("/messages", { conversationId: "cnv_1", toRequest: true })).toBeNull();
    });

    it("is null when the tab is hidden", () => {
        expect(at("/learning", accepted(), { visible: false })).toBeNull();
        expect(at("/learning", { conversationId: "cnv_1", toRequest: true }, { visible: false })).toBeNull();
    });

    it("is null for my own message, inline or as a ping", () => {
        expect(at("/learning", accepted({ message: { id: "msg_1", sender: { id: "u_me" } } }))).toBeNull();
        expect(at("/learning", accepted({ message: undefined, messageId: "msg_1", senderId: "u_me" }))).toBeNull();
    });

    it("names the sender or the team, shows the preview and opens the conversation", () => {
        expect(at("/learning", accepted())).toEqual({ id: "chat-toast:cnv_1", title: "Ada", description: "hello there", href: "/messages/cnv_1" });
        expect(at("/", accepted({ conversationKind: "team", title: "Night owls", message: undefined, messageId: "msg_1", senderId: "u_ada" })))
            .toEqual({ id: "chat-toast:cnv_1", title: "Night owls", description: "hello there", href: "/messages/cnv_1" });
    });

    it("a request is anonymous: no name or preview in any field", () => {
        const toast = at("/learning", { conversationId: "cnv_1", messageId: "msg_1", seq: "3", toRequest: true });
        expect(toast).toEqual({ id: "chat-toast:cnv_1", title: "New message request", description: undefined, href: "/messages?tab=requests" });
        // Even a payload that wrongly carried them must not leak them.
        const leaky = at("/learning", { ...accepted(), toRequest: true });
        expect(leaky).toEqual(toast);
        expect(JSON.stringify(leaky)).not.toMatch(/Ada|ada|hello/);
    });

    it("is null without a title rather than inventing one", () => {
        expect(at("/learning", accepted({ title: undefined }))).toBeNull();
    });
});
