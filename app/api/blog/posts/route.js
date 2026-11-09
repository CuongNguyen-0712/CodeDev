import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { postInputSchema, postListSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";

// GET ?tag=&cursor=: published posts, newest first. Public, but never cached: hidden posts must vanish at once.
export const GET = apiRoute(
    async ({ req }) => {
        const input = parseOrThrow(postListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return blogService.listPublished({ tag: input.tag, cursor: input.cursor });
    },
    { context: "api/blog/posts", auth: "none" }
);

// POST { title, tags, body, submit }: create a draft, or submit it for review. The body may be
// 50,000 characters, so the default 16 KB JSON cap is raised.
export const POST = apiRoute(
    async ({ req, userId }) => blogService.create({ userId, input: parseOrThrow(postInputSchema, await readJson(req, 160 * 1024)) }),
    { context: "api/blog/posts", csrf: true, limiter: rateLimiters.blogCreate, status: 201 }
);
