import { chatId, seqParam } from "@/lib/chat/routeParams";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

// GET ?before=<seq>: a page of messages, newest first; no `before` = the newest page.
export const GET = apiRoute(async ({ req, userId, params }) => chatService.listMessages({
    userId, conversationId: chatId("cnv", params.id), before: seqParam(new URL(req.url).searchParams.get("before")),
}), { context: "api/chat/conversations/[id]/messages", limiter: rateLimiters.api });
