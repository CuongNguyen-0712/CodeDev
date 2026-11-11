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
const showAlert = vi.fn();
vi.mock("@/components/ui/alert", () => ({ showAlert: (...a) => showAlert(...a) }));

const { default: Composer } = await import("@/components/chat/composer");

const box = () => screen.getByRole("textbox", { name: "Message" });
const fileInput = (container) => container.querySelector('input[type="file"]');

// XMLHttpRequest stand-in: records what was sent so a test can finish the request itself.
const requests = [];
class FakeXHR {
    constructor() { this.headers = {}; this.upload = {}; requests.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
    finish(status = 200) { this.status = status; this.onload(); }
}

beforeEach(() => {
    vi.clearAllMocks();
    requests.length = 0;
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
    vi.stubGlobal("createImageBitmap", async () => ({ width: 40, height: 30, close() {} }));
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Composer", () => {
    it("Enter sends and Shift+Enter adds a newline", async () => {
        const onSubmit = vi.fn(async () => {});
        render(<Composer conversationId="cnv_a" optimistic onSubmit={onSubmit} />);
        fireEvent.change(box(), { target: { value: "hi" } });

        // Not prevented: the browser inserts the newline itself.
        expect(fireEvent.keyDown(box(), { key: "Enter", shiftKey: true })).toBe(true);
        expect(onSubmit).not.toHaveBeenCalled();

        expect(fireEvent.keyDown(box(), { key: "Enter" })).toBe(false);
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ body: "hi", attachmentIds: [], attachments: [] }));
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

    it("after a 422 invalid upload drops every attachment chip, keeps the text and toasts", async () => {
        createUpload.mockResolvedValue({ attachmentId: "att_1", upload: { method: "PUT", url: "https://s3/u", headers: {} } });
        const onSubmit = vi.fn(async () => { throw Object.assign(new Error("The uploaded file is invalid"), { status: 422 }); });
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed onSubmit={onSubmit} />);
        fireEvent.change(fileInput(container), { target: { files: [new File(["x"], "a.txt", { type: "text/plain" })] } });
        await screen.findByRole("button", { name: "Remove a.txt" });
        await waitFor(() => expect(requests).toHaveLength(1));
        requests[0].finish();
        fireEvent.change(box(), { target: { value: "hello" } });
        await waitFor(() => expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(false));
        fireEvent.keyDown(box(), { key: "Enter" });
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(422, "An attachment was rejected. Add your attachments again."));
        expect(screen.queryByRole("button", { name: "Remove a.txt" })).toBeNull();
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
        // A toast, not text inside the composer.
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(413, "big.png is larger than 5 MB."));
        expect(screen.queryByText("big.png is larger than 5 MB.")).toBeNull();
        expect(createUpload).not.toHaveBeenCalled();
    });

    it("refuses a type that is neither an image nor an allowed file", async () => {
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        fireEvent.change(fileInput(container), { target: { files: [new File(["x"], "a.gif", { type: "image/gif" })] } });
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(400, "a.gif: this file type can't be sent."));
        expect(createUpload).not.toHaveBeenCalled();
    });

    it("hides the image button in a request", () => {
        const { container } = render(<Composer conversationId="cnv_a" optimistic onSubmit={vi.fn()} />);
        expect(screen.queryByRole("button", { name: "Attach files" })).toBeNull();
        expect(fileInput(container)).toBeNull();
    });

    it("accepts a pdf, shows a file chip and uploads with a PUT ticket", async () => {
        createUpload.mockResolvedValue({ attachmentId: "att_1", upload: { method: "PUT", url: "https://s3/u", headers: { "content-type": "application/pdf" } } });
        const onSubmit = vi.fn(async () => {});
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={onSubmit} />);
        const pdf = new File([new Uint8Array(2500)], "spec.pdf", { type: "application/pdf" });
        fireEvent.change(fileInput(container), { target: { files: [pdf] } });

        expect(await screen.findByText("spec.pdf")).toBeTruthy();
        expect(screen.getByText("3 KB")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Remove spec.pdf" })).toBeTruthy();
        await waitFor(() => expect(requests).toHaveLength(1));
        expect(createUpload).toHaveBeenCalledWith({ conversationId: "cnv_a", kind: "file", name: "spec.pdf", size: 2500 });
        expect(requests[0]).toMatchObject({ method: "PUT", url: "https://s3/u", body: pdf });
        expect(requests[0].headers).toEqual({ "content-type": "application/pdf" });

        // Not sendable until the upload finishes.
        expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(true);
        requests[0].finish();
        await waitFor(() => expect(screen.getByRole("button", { name: "Send" }).disabled).toBe(false));
        fireEvent.click(screen.getByRole("button", { name: "Send" }));
        await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({
            body: "", attachmentIds: ["att_1"], attachments: [{ id: "att_1", kind: "file", name: "spec.pdf", size: 2500 }],
        }));
    });

    it("forwards an Upstash if-none-match header and never sets Content-Length", async () => {
        createUpload.mockResolvedValue({
            attachmentId: "att_2",
            upload: { method: "PUT", url: "https://blob/u", headers: { "if-none-match": "*", "Content-Length": "9", "content-length": "9" } },
        });
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        fireEvent.change(fileInput(container), { target: { files: [new File(["x"], "n.txt", { type: "text/plain" })] } });
        await waitFor(() => expect(requests).toHaveLength(1));
        expect(requests[0].headers).toEqual({ "if-none-match": "*" });
    });

    it("uploads an image with a Cloudinary POST ticket as FormData", async () => {
        createUpload.mockResolvedValue({ attachmentId: "att_3", upload: { method: "POST", url: "https://api.cloudinary.com/up", fields: { api_key: "k", signature: "s" } } });
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        const png = new File(["img"], "a.png", { type: "image/png" });
        fireEvent.change(fileInput(container), { target: { files: [png] } });

        await waitFor(() => expect(requests).toHaveLength(1));
        expect(createUpload).toHaveBeenCalledWith({ conversationId: "cnv_a", kind: "image", name: "a.png", contentType: "image/png", size: 3, width: 40, height: 30 });
        const [req] = requests;
        expect(req.method).toBe("POST");
        expect(req.body).toBeInstanceOf(FormData);
        expect([...req.body.keys()]).toEqual(["api_key", "signature", "file"]);
        expect(req.body.get("api_key")).toBe("k");
        expect(req.body.get("file").name).toBe("a.png");
        expect(Object.keys(req.headers).map((h) => h.toLowerCase())).not.toContain("content-length");
    });

    it("toasts a refused .exe and an oversized file", async () => {
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        const exe = new File(["x"], "setup.exe", { type: "application/x-msdownload" });
        const big = new File([new Uint8Array(15_000_001)], "big.zip", { type: "application/zip" });
        fireEvent.change(fileInput(container), { target: { files: [exe, big] } });
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(400, "setup.exe: this file type can't be sent."));
        expect(showAlert).toHaveBeenCalledWith(413, "big.zip is larger than 15 MB.");
        expect(createUpload).not.toHaveBeenCalled();
    });

    it("toasts when more than 4 attachments are picked", async () => {
        createUpload.mockReturnValue(new Promise(() => { }));
        const { container } = render(<Composer conversationId="cnv_a" imagesAllowed optimistic onSubmit={vi.fn()} />);
        const files = Array.from({ length: 5 }, (_, i) => new File(["x"], `n${i}.txt`, { type: "text/plain" }));
        fireEvent.change(fileInput(container), { target: { files } });
        await waitFor(() => expect(showAlert).toHaveBeenCalledWith(400, "You can attach up to 4 files."));
    });
});
