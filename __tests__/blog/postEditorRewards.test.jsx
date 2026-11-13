// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/** The editor announces the publish reward instead of the plain alert; the hooks, router and level module are replaced. */
const showAlert = vi.fn();
const announceRewards = vi.fn();
const router = { push: vi.fn(), replace: vi.fn() };
const draft = { id: "pst_1", title: "Hello", tags: ["a"], body: "text", status: "draft" };
// Each mutate resolves through the options it is given, like react-query does.
let result;
const mutation = { isPending: false, mutate: vi.fn((_, options) => options.onSuccess(result)) };

vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/contexts/appContext", () => ({ useApp: () => ({ showAlert }) }));
vi.mock("@/components/ui/level", () => ({ announceRewards }));
vi.mock("@/mutations/blog.mutation", () => ({ useCreatePost: () => mutation, useUpdatePost: () => mutation, useUploadBlogImage: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/queries/blog.query", () => ({ blogQueries: { mine: () => ({ queryKey: ["mine"] }), post: () => ({ queryKey: ["post"] }) } }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }) => ({ isPending: false, isError: false, data: queryKey[0] === "mine" ? { trusted: true } : draft }) }));

const { default: PostEditor } = await import("@/components/blog/postEditor");

beforeEach(() => { mutation.mutate.mockClear(); });
afterEach(() => { cleanup(); [showAlert, announceRewards, router.push, router.replace].forEach((fn) => fn.mockClear()); });

const rewards = { awardedExp: 20, level: 2, previousLevel: 1 };
const publish = () => fireEvent.click(screen.getByRole("button", { name: "Publish" }));
const fill = () => {
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Hello" } });
    fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a," } });
};

describe("missing fields", () => {
    it("are reported on the field, with focus on the first one, and nothing is sent", () => {
        render(<PostEditor />);
        publish();
        const title = screen.getByLabelText("Title");
        expect(screen.getByText("Add a title")).toBeTruthy();
        expect(screen.getByText("Add at least one tag")).toBeTruthy();
        expect(title.getAttribute("aria-invalid")).toBe("true");
        expect(document.activeElement).toBe(title);
        expect(mutation.mutate).not.toHaveBeenCalled();
        expect(showAlert).not.toHaveBeenCalled();

        // Typing the title clears its error; the tag error stays until a tag is added.
        fireEvent.change(title, { target: { value: "Hello" } });
        expect(screen.queryByText("Add a title")).toBeNull();
        expect(screen.getByText("Add at least one tag")).toBeTruthy();
        fireEvent.change(screen.getByLabelText("Tags"), { target: { value: "a," } });
        expect(screen.queryByText("Add at least one tag")).toBeNull();
    });

    it("Add image is offered on the Write tab only", () => {
        render(<PostEditor />);
        expect(screen.getByRole("button", { name: "Add image" })).toBeTruthy();
        // Radix tabs switch on mouse down.
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Preview" }), { button: 0 });
        expect(screen.queryByRole("button", { name: "Add image" })).toBeNull();
    });
});

describe("Markdown buttons", () => {
    it("insert at the caret and wrap a selection", async () => {
        render(<PostEditor />);
        const body = screen.getByLabelText("Post body in Markdown");
        fireEvent.change(body, { target: { value: "Intro" } });
        body.setSelectionRange(0, 5);
        fireEvent.click(screen.getByRole("button", { name: "Bold" }));
        expect(body.value).toBe("**Intro**");

        body.setSelectionRange(0, 0);
        fireEvent.click(screen.getByRole("button", { name: "Heading 3" }));
        expect(body.value).toBe("### **Intro**");

        body.setSelectionRange(body.value.length, body.value.length);
        fireEvent.click(screen.getByRole("button", { name: "Code block with a file name" }));
        expect(body.value).toBe("### **Intro**\n```js app.js\ncode\n```");
    });

    it("are off on the Preview tab", () => {
        render(<PostEditor />);
        fireEvent.mouseDown(screen.getByRole("tab", { name: "Preview" }), { button: 0 });
        expect(screen.getByRole("button", { name: "Bold" }).disabled).toBe(true);
    });
});

describe.each([
    ["create", undefined, () => fill()],
    ["update", "pst_1", () => {}],
])("%s", (_, id, prepare) => {
    it("announces EXP when the publish paid", () => {
        result = { id: "pst_1", slug: "hello", status: "published", rewards };
        render(<PostEditor id={id} />);
        prepare();
        publish();
        expect(announceRewards).toHaveBeenCalledTimes(1);
        expect(announceRewards).toHaveBeenCalledWith(rewards, { title: "Post published", id: "blog-published:pst_1" });
        expect(showAlert).not.toHaveBeenCalledWith(200, expect.anything());
    });

    it("keeps the plain alert without rewards", () => {
        result = { id: "pst_1", slug: "hello", status: "pending" };
        render(<PostEditor id={id} />);
        prepare();
        publish();
        expect(announceRewards).not.toHaveBeenCalled();
        expect(showAlert).toHaveBeenCalledWith(200, "Post submitted");
    });
});
