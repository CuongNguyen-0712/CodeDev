import { describe, expect, it } from "vitest";

import { adminBlogActionSchema, postInputSchema, postPatchSchema } from "@/lib/validation/blog";

const base = { title: "Hello", tags: ["a"], body: "text" };

describe("adminBlogActionSchema", () => {
    it.each(["reject", "hide"])("requires a reason for %s", (action) => {
        expect(adminBlogActionSchema.safeParse({ action }).success).toBe(false);
        expect(adminBlogActionSchema.safeParse({ action, reason: "spam content" }).success).toBe(true);
    });
    it.each(["approve", "show"])("allows %s without a reason", (action) => {
        expect(adminBlogActionSchema.safeParse({ action }).success).toBe(true);
    });
});

describe("postPatchSchema", () => {
    it("bounds appealReason to 10..500", () => {
        expect(postPatchSchema.safeParse({ ...base, appealReason: "x".repeat(9) }).success).toBe(false);
        expect(postPatchSchema.safeParse({ ...base, appealReason: "x".repeat(10) }).success).toBe(true);
        expect(postPatchSchema.safeParse({ ...base, appealReason: "x".repeat(500) }).success).toBe(true);
        expect(postPatchSchema.safeParse({ ...base, appealReason: "x".repeat(501) }).success).toBe(false);
    });
});

describe("postInputSchema", () => {
    it("normalizes tags before validating", () => {
        expect(postInputSchema.parse({ ...base, tags: [" Next JS ", "nextjs", "next-js"] }).tags).toEqual(["next-js", "nextjs"]);
    });
    it("rejects tags outside ^[a-z0-9-]{1,30}$", () => {
        expect(postInputSchema.safeParse({ ...base, tags: ["c#"] }).success).toBe(false);
        expect(postInputSchema.safeParse({ ...base, tags: ["a".repeat(31)] }).success).toBe(false);
        expect(postInputSchema.safeParse({ ...base, tags: ["-"] }).success).toBe(true);
    });
    it("rejects 6 tags", () => expect(postInputSchema.safeParse({ ...base, tags: ["a", "b", "c", "d", "e", "f"] }).success).toBe(false));
    it("rejects a 2-character title", () => expect(postInputSchema.safeParse({ ...base, title: "ab" }).success).toBe(false));
    it("defaults submit to false", () => expect(postInputSchema.parse(base).submit).toBe(false));
});
