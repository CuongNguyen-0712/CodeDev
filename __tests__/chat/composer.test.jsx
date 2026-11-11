// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

/** Conversation composer (spec sections 7 and 9). */
const createUpload = vi.fn();
const ping = vi.fn();

vi.mock("@/mutations/chat.mutation", () => ({
    useCreateChatUpload: () => ({ mutateAsync: (...a) => createUpload(...a) }),
    useTypingPing: () => ping,
}));

const { default: Composer } = await import("@/components/chat/composer");

const box = () => screen.getByRole("textbox", { name: "Message" });
const fileInput = (container) => container.querySelector('input[type="file"]');

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("Composer", () => {
    it("Enter sends and Shift+Enter adds a newline", async () => {
        const onSubmit = vi.fn(async () => {});
        render(<Composer conversationId="cnv_a" optimistic onSubmit={onSubmit} />);
        fireEvent.change(box(), { target: { value: "hi" } });

        // Not prevented: the browser inserts the newline itself.
        expect(fireEvent.keyDown(box(), { key: "Enter", shiftKey: true })).toBe(true);
        expect(onSubmit).not.toHaveBeenCalled();

        expect(fireEvent.keyDown(box(), { key: "Enter" })).toBe(false);
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ body: "hi", attachmentIds: [] }));
        expect(box().value).toBe("");
    });

    it("sends a typing ping while writing in a conversation", () => {
        render(<Composer conversationId="cnv_a" optimistic onSubmit={vi.fn()} />);
        fireEvent.change(box(), { target: { value: "h" } });
        expect(ping).toHaveBeenCalled();
    });

    it("keeps the text and shows the error when a send fails", async () => {
        const onSubmit = vi.fn(async () => { throw Object.assign(new Error("You can't send messages in this conversation"), { status: 403 }); });
        render(<Composer onSubmit={onSubmit} />);
        fireEvent.change(box(), { target: { value: "hello" } });
        fireEvent.keyDown(box(), { key: "Enter" });
        expect(await screen.findByText("You can't send messages in this conversation")).toBeTruthy();
        expect(box().value).toBe("hello");
    });

    it("shows a counter only past 3,600 characters", () => {
        render(<Composer onSubmit={vi.fn()} />);
        fireEvent.change(box(), { target: { value: "a".repeat(3600) } });
        expect(screen.queryByText("3600/4000")).toBeNull();
        fireEvent.change(box(), { target: { value: "a".repeat(3601) } });
        expect(screen.getByText("3601/4000")).toBeTruthy();
    });

    it("refuses a 6 MB image before uploading", async () => {
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        const big = new File([new Uint8Array(6_000_000)], "big.png", { type: "image/png" });
        fireEvent.change(fileInput(container), { target: { files: [big] } });
        expect(await screen.findByText("big.png is larger than 5 MB.")).toBeTruthy();
        expect(createUpload).not.toHaveBeenCalled();
    });

    it("refuses a file type other than JPEG, PNG or WebP", async () => {
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        fireEvent.change(fileInput(container), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
        expect(await screen.findByText("Only JPEG, PNG and WebP images can be sent.")).toBeTruthy();
        expect(createUpload).not.toHaveBeenCalled();
    });

    it("hides the image button in a request", () => {
        const { container } = render(<Composer conversationId="cnv_a" optimistic onSubmit={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Attach images" })).toBeNull();
        expect(fileInput(container)).toBeNull();
    });
});
