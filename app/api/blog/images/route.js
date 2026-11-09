import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { mediaService } from "@/services/media.service";

// POST multipart { file }: upload a post image; returns the stored image.
export const POST = apiRoute(
    async ({ req, userId }) => mediaService.uploadBlogImage({ userId, file: (await req.formData()).get("file") }),
    { context: "api/blog/images", csrf: true, limiter: rateLimiters.upload }
);
