import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { postInputSchema, postListSchema } from "@/lib/validation/blog";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { blogService } from "@/services/blog.service";

// GET ?tag=&cursor=: published posts, newest first. Public and edge-cacheable.
export const GET = apiRoute(
    async ({ req }) => {
        const input = parseOrThrow(postListSchema, Object.fromEntries(new URL(req.url).searchParams));
        return blogService.listPublished({ tag: input.tag, cursor: input.cursor });
    },
    { context: "api/blog/posts", auth: "none", cacheControl: "public, s-maxage=60, stale-while-revalidate=300" }
);

// POST { title, tags, body, submit }: create a draft, or submit it for review.
export const POST = apiRoute(
    async ({ req, userId }) => blogService.create({ userId, input: parseOrThrow(postInputSchema, await readJson(req)) }),
    { context: "api/blog/posts", csrf: true, limiter: rateLimiters.blogCreate, status: 201 }
);
