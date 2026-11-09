import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));

import { revalidateTag } from "next/cache";

import { cacheTags, revalidateBlog } from "@/lib/pageCache";

describe("blog cache tags", () => {
    beforeEach(() => revalidateTag.mockClear());

    it("names the tags", () => {
        expect(cacheTags.blog).toBe("blog");
        expect(cacheTags.post("pst_x")).toBe("post:pst_x");
    });

    it("revalidates the index and the post", () => {
        revalidateBlog("pst_x");
        expect(revalidateTag.mock.calls).toEqual([["blog", "max"], ["post:pst_x", "max"]]);
    });

    it("revalidates only the index without a post", () => {
        revalidateBlog();
        expect(revalidateTag.mock.calls).toEqual([["blog", "max"]]);
    });
});
