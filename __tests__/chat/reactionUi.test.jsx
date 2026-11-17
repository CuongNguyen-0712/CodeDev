// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** Reaction UI: the React popover, its lazily loaded full picker, and the chips (spec section 5.3). */
vi.mock("@/components/chat/messageBody", () => ({ default: ({ body }) => <p>{body}</p> }));
const picker = vi.hoisted(() => ({ loaded: 0 }));
vi.mock("@/components/shadcn/emoji-picker", () => {
    picker.loaded++;
    return { EmojiPicker: ({ onEmojiSelect }) => <button type="button" onClick={() => onEmojiSelect({ emoji: "🎉" })}>Full picker</button> };
});

const { default: MessageBubble } = await import("@/components/chat/messageBubble");

const me = { id: "P1", username: "me", nickname: null, image: null };
const other = { id: "P2", username: "ada", nickname: null, image: null };
const message = (over = {}) => ({
    id: "msg_a", seq: "10", conversationId: "cnv_a", clientId: "c1", sender: other, body: "hello",
    attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, replyTo: null, reactions: [], ...over,
});
const noop = () => {};
const base = { others: [], meId: "P1", canReact: true, onReply: noop, onReact: noop, onRetry: noop, onDiscard: noop, onUnsend: noop, onReport: noop };
const openMenu = () => fireEvent.pointerDown(screen.getByRole("button", { name: /More actions for/ }), { button: 0, ctrlKey: false });

afterEach(cleanup);

describe("React popover", () => {
    it("React shows the 6 quick emoji; + loads the full picker lazily", async () => {
        const onReact = vi.fn();
        render(<MessageBubble message={message()} {...base} onReact={onReact} />);
        expect(picker.loaded).toBe(0);
        fireEvent.click(screen.getByRole("button", { name: "React to message" }));
        for (const emoji of ["👍", "❤️", "😂", "😮", "😢", "😡"]) expect(await screen.findByRole("button", { name: `React with ${emoji}` })).toBeTruthy();
        expect(picker.loaded).toBe(0);

        fireEvent.click(screen.getByRole("button", { name: "More emoji" }));
        fireEvent.click(await screen.findByRole("button", { name: "Full picker" }));
        expect(picker.loaded).toBe(1);
        expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "msg_a" }), "🎉");
        await waitFor(() => expect(screen.queryByRole("button", { name: "Full picker" })).toBeNull());
    });

    it("the menu's React item opens the same quick row, and picking closes it", async () => {
        const onReact = vi.fn();
        render(<MessageBubble message={message()} {...base} onReact={onReact} />);
        openMenu();
        fireEvent.click(await screen.findByRole("menuitem", { name: "React" }));
        fireEvent.click(await screen.findByRole("button", { name: "React with 😂" }));
        expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "msg_a" }), "😂");
        await waitFor(() => expect(screen.queryByRole("button", { name: "React with 😂" })).toBeNull());
    });

    it("a pending member sees no React action", async () => {
        render(<MessageBubble message={message()} {...base} canReact={false} />);
        expect(screen.queryByRole("button", { name: "React to message" })).toBeNull();
        expect(screen.getByRole("button", { name: "Reply to message" })).toBeTruthy();
        openMenu();
        expect(await screen.findByRole("menuitem", { name: "Reply" })).toBeTruthy();
        expect(screen.queryByRole("menuitem", { name: "React" })).toBeNull();
    });

    it("Copy, Edit, Unsend and Report items still show as before", async () => {
        const { unmount } = render(<MessageBubble message={message({ sender: me, createdAt: new Date().toISOString() })} mine {...base} />);
        openMenu();
        for (const name of ["Reply", "React", "Copy", "Edit", "Unsend"]) expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
        unmount();
        render(<MessageBubble message={message()} {...base} />);
        openMenu();
        for (const name of ["Reply", "React", "Copy", "Report"]) expect(await screen.findByRole("menuitem", { name })).toBeTruthy();
    });
});

describe("reaction chips", () => {
    const reactions = [{ emoji: "👍", count: 2, userIds: ["P1", "P2"] }, { emoji: "❤️", count: 1, userIds: ["P2"] }];

    it("chips show emoji and count, are outlined when mine, and toggle on click", () => {
        const onReact = vi.fn();
        render(<MessageBubble message={message({ reactions })} {...base} onReact={onReact} />);
        const mine = screen.getByRole("button", { name: "👍 2, remove your reaction" });
        const notMine = screen.getByRole("button", { name: "❤️ 1, add your reaction" });
        expect(mine.textContent).toBe("👍2");
        expect(mine.getAttribute("aria-pressed")).toBe("true");
        expect(mine.className).toContain("border-primary");
        expect(notMine.getAttribute("aria-pressed")).toBe("false");
        expect(notMine.className).toContain("border-transparent");
        fireEvent.click(notMine);
        expect(onReact).toHaveBeenCalledWith(expect.objectContaining({ id: "msg_a" }), "❤️");
    });

    it("chips are plain text when the viewer cannot react", () => {
        render(<MessageBubble message={message({ reactions })} {...base} canReact={false} />);
        expect(screen.queryByRole("button", { name: /remove your reaction|add your reaction/ })).toBeNull();
        const chip = screen.getByRole("img", { name: "👍 2" });
        expect(chip.tagName).toBe("SPAN");
        expect(screen.getByText("👍").getAttribute("aria-hidden")).toBe("true");
    });
});
