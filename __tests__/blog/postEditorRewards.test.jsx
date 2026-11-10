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
