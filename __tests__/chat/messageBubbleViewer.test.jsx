// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** Image viewer and the Copy item of one message row (chat UX phase 1, task 4). */
vi.mock("@/components/chat/messageBody", () => ({ default: ({ body }) => <p>{body}</p> }));
const showAlert = vi.fn();
vi.mock("@/components/ui/alert", () => ({ showAlert: (...args) => showAlert(...args) }));

const { default: MessageBubble } = await import("@/components/chat/messageBubble");

const me = { id: "P1", username: "me", nickname: null, image: null };
const message = (over = {}) => ({
    id: "msg_a", seq: "10", conversationId: "cnv_a", clientId: "c1", sender: me, body: "hello",
    attachments: [], createdAt: "2026-11-11T10:00:00Z", editedAt: null, deleted: false, ...over,
});
const noop = () => {};
const handlers = { onRetry: noop, onDiscard: noop, onEdit: noop, onUnsend: noop, onReport: noop };
const sentImages = [{ id: "att_1", kind: "image" }, { id: "att_2", kind: "image" }, { id: "att_3", kind: "image" }];
const triggerOf = (name) => screen.getByRole("img", { name }).closest("button");

afterEach(() => { cleanup(); showAlert.mockClear(); });

describe("MessageBubble image viewer", () => {
    it("clicking a sent image opens the viewer at that image", async () => {
        render(<MessageBubble message={message({ attachments: sentImages })} mine others={[]} {...handlers} />);
        fireEvent.click(triggerOf("Attached image 2 of 3"));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/api/chat/attachments/att_2");
        expect(screen.getByRole("link", { name: "Open original" }).getAttribute("href")).toBe("/api/chat/attachments/att_2");
    });

    it("arrows and keys move between the message's images; one image hides the arrows", async () => {
        const { unmount } = render(<MessageBubble message={message({ attachments: sentImages })} mine others={[]} {...handlers} />);
        fireEvent.click(triggerOf("Attached image 1 of 3"));
        const dialog = await screen.findByRole("dialog");
        fireEvent.click(screen.getByRole("button", { name: "Next image" }));
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/api/chat/attachments/att_2");
        fireEvent.keyDown(dialog, { key: "ArrowRight" });
        expect(dialog.querySelector("img").getAttribute("src")).toBe("/api/chat/attachments/att_3");
        unmount();
        cleanup();
        render(<MessageBubble message={message({ attachments: [sentImages[0]] })} mine others={[]} {...handlers} />);
        fireEvent.click(triggerOf("Attached image"));
        await screen.findByRole("dialog");
        expect(screen.queryByRole("button", { name: "Next image" })).toBeNull();
    });

    it("an unsent image opens the viewer with its blob preview", async () => {
        const attachments = [{ id: "att_i", kind: "image", previewUrl: "blob:preview" }];
        render(<MessageBubble message={message({ id: null, seq: null, status: "sending", attachments })} mine others={[]} {...handlers} />);
        fireEvent.click(triggerOf("Attached image"));
        const dialog = await screen.findByRole("dialog");
        expect(dialog.querySelector("img").getAttribute("src")).toBe("blob:preview");
        expect(screen.queryByRole("link", { name: "Open original" })).toBeNull();
    });

    it("the image trigger has a visible inset focus outline", () => {
        render(<MessageBubble message={message({ attachments: [sentImages[0]] })} mine others={[]} {...handlers} />);
        const classes = triggerOf("Attached image").className;
        for (const c of ["focus-visible:outline-solid", "focus-visible:outline-2", "focus-visible:-outline-offset-2", "focus-visible:outline-ring"]) expect(classes).toContain(c);
    });

    it("a broken image shows the error text", async () => {
        render(<MessageBubble message={message({ attachments: [sentImages[0]] })} mine others={[]} {...handlers} />);
        fireEvent.click(triggerOf("Attached image"));
        const dialog = await screen.findByRole("dialog");
        fireEvent.error(dialog.querySelector("img"));
        expect(screen.getByText("This image could not be loaded.")).toBeTruthy();
    });
});

describe("MessageBubble Copy", () => {
    const openMenu = (over) => {
        render(<MessageBubble message={message(over)} mine others={[]} {...handlers} />);
        const trigger = screen.getByRole("button", { name: /More actions/ });
        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    };

    it("Copy writes the raw body and toasts Copied", async () => {
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        openMenu({ body: "**raw** body" });
        fireEvent.click(await screen.findByRole("menuitem", { name: "Copy" }));
        expect(writeText).toHaveBeenCalledWith("**raw** body");
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(200, "Copied"));
    });

    it("a message without text has no Copy item", async () => {
        openMenu({ body: "", attachments: sentImages });
        await screen.findByRole("menuitem", { name: "Unsend" });
        expect(screen.queryByRole("menuitem", { name: "Copy" })).toBeNull();
    });
});
