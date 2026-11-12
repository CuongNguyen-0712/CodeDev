import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

export const GET = apiRoute(
    async ({ userId }) => chatService.listBlocks({ userId }),
    { context: "api/chat/blocks", limiter: rateLimiters.api }
);
