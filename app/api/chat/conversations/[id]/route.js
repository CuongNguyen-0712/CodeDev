import { chatId } from "@/lib/chat/routeParams";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

export const GET = apiRoute(
    async ({ userId, params }) => chatService.getConversation({ userId, conversationId: chatId("cnv", params.id) }),
    { context: "api/chat/conversations/[id]", limiter: rateLimiters.api }
);
