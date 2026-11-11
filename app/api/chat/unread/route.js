import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

export const GET = apiRoute(
    async ({ userId }) => chatService.unreadCounts({ userId }),
    { context: "api/chat/unread", limiter: rateLimiters.api }
);
