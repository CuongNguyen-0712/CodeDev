import { z } from "zod";

import { BLOG_LIMITS, normalizeTags } from "@/lib/blog/text.mjs";

const tag = z.string().regex(/^[a-z0-9-]{1,30}$/, "Invalid tag");
const reason = z.string().trim().min(5, "Give a reason of at least 5 characters").max(BLOG_LIMITS.appealReason);
const cursor = z.string().trim().max(200).optional();

export const postInputSchema = z.object({
    title: z.string().trim().min(3, "Title is too short").max(BLOG_LIMITS.title),
    tags: z.array(z.string()).max(BLOG_LIMITS.tags).transform(normalizeTags).pipe(z.array(tag).max(BLOG_LIMITS.tags)),
    body: z.string().trim().min(1, "Write something").max(BLOG_LIMITS.body),
    submit: z.boolean().default(false),
});

export const postPatchSchema = postInputSchema.extend({
    appealReason: z.string().trim().min(10).max(BLOG_LIMITS.appealReason).optional(),
});

export const postListSchema = z.object({ tag: tag.optional(), cursor });

export const adminBlogListSchema = z.object({
    status: z.enum(["pending", "appeal", "hidden", "rejected", "published"]),
    cursor,
});

export const adminBlogActionSchema = z.object({
    action: z.enum(["approve", "reject", "hide", "show"]),
    reason: reason.optional(),
}).refine((v) => !["reject", "hide"].includes(v.action) || v.reason, { message: "A reason is required", path: ["reason"] });
