import { chatId } from "@/lib/chat/routeParams";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

export const GET = apiRoute(
    async ({ userId, params }) => chatService.getMessage({ userId, messageId: chatId("msg", params.id) }),
    { context: "api/chat/messages/[id]", limiter: rateLimiters.api }
);
