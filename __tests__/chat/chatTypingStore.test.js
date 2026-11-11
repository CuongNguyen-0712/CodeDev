import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TYPING_SHOW_MS } from "@/lib/chat/limits";
import { selectTypingUsers, useChatTypingStore } from "@/stores/chatTypingStore";

beforeEach(() => {
    vi.useFakeTimers();
    useChatTypingStore.setState(useChatTypingStore.getInitialState());
});
afterEach(() => vi.useRealTimers());

describe("chatTypingStore", () => {
    it("shows a typer until TYPING_SHOW_MS has passed", () => {
        useChatTypingStore.getState().setTyping("cnv_1", "u1");
        const now = Date.now();
        const state = useChatTypingStore.getState();
        expect(selectTypingUsers(state, "cnv_1", now)).toEqual(["u1"]);
        expect(selectTypingUsers(state, "cnv_1", now + TYPING_SHOW_MS - 1)).toEqual(["u1"]);
        expect(selectTypingUsers(state, "cnv_1", now + TYPING_SHOW_MS)).toEqual([]);
    });
    it("clear removes one typer", () => {
        const s = useChatTypingStore.getState();
        s.setTyping("cnv_1", "u1");
        s.setTyping("cnv_1", "u2");
        s.clear("cnv_1", "u1");
        expect(selectTypingUsers(useChatTypingStore.getState(), "cnv_1", Date.now())).toEqual(["u2"]);
    });
});
