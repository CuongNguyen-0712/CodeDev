// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/** One message row: read marks, unsent state and the failed-send actions (spec sections 7 and 9). */
vi.mock("@/components/chat/messageBody", () => ({ default: ({ body }) => <p>{body}</p> }));

const { default: MessageBubble, seenByAll } = await import("@/components/chat/messageBubble");

const me = { id: "P1", username: "me", nickname: null, image: null };
const message = (over = {}) => ({
    id: "msg_a", seq: "10", conversationId: "cnv_a", clientId: "c1", sender: me, body: "hello",
    attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, ...over,
});
const noop = () => {};
const handlers = { onRetry: noop, onDiscard: noop, onEdit: noop, onUnsend: noop, onReport: noop };

afterEach(cleanup);

describe("seenByAll", () => {
    it("compares seqs as numbers, not strings", () => {
        expect(seenByAll("10", [{ lastReadSeq: "9" }])).toBe(false);
        expect(seenByAll("9", [{ lastReadSeq: "10" }])).toBe(true);
    });
    it("needs every other member", () => {
        expect(seenByAll("5", [{ lastReadSeq: "5" }, { lastReadSeq: "4" }])).toBe(false);
        expect(seenByAll("5", [])).toBe(false);
    });
});

describe("MessageBubble", () => {
    it("shows one check when sent and two when everyone else read it", () => {
        const { rerender } = render(<MessageBubble message={message()} mine others={[{ id: "P2", lastReadSeq: "9" }]} {...handlers} />);
        expect(screen.getByText("Sent")).toBeTruthy();
        rerender(<MessageBubble message={message()} mine others={[{ id: "P2", lastReadSeq: "10" }]} {...handlers} />);
        expect(screen.getByText("Seen")).toBeTruthy();
    });

    it("offers Retry and Discard on a failed send", () => {
        const onRetry = vi.fn();
        const onDiscard = vi.fn();
        const failed = message({ id: null, seq: null, status: "failed" });
        render(<MessageBubble message={failed} mine others={[]} {...handlers} onRetry={onRetry} onDiscard={onDiscard} />);
        fireEvent.click(screen.getByRole("button", { name: "Retry" }));
        fireEvent.click(screen.getByRole("button", { name: "Discard" }));
        expect(onRetry).toHaveBeenCalledWith(failed);
        expect(onDiscard).toHaveBeenCalledWith(failed);
    });

    it("hides Retry when the send was refused", () => {
        render(<MessageBubble message={message({ id: null, seq: null, status: "failed" })} mine others={[]} failure={{ retryable: false, message: "You can't send messages in this conversation" }} {...handlers} />);
        expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
        expect(screen.getByText("You can't send messages in this conversation")).toBeTruthy();
    });

    it("shows an unsent message without its body", () => {
        render(<MessageBubble message={message({ deleted: true, body: "" })} others={[]} {...handlers} />);
        expect(screen.getByText("This message was unsent")).toBeTruthy();
    });

    it("marks an edited message", () => {
        render(<MessageBubble message={message({ editedAt: "2026-11-11T10:05:00Z" })} others={[]} {...handlers} />);
        expect(screen.getByText("edited")).toBeTruthy();
    });
});
