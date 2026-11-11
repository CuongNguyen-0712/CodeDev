import { ApiError } from "@/lib/error/apiError";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

// GET ?tab=all|requests&cursor=: the inbox. The service validates the cursor.
export const GET = apiRoute(async ({ req, userId }) => {
    const q = new URL(req.url).searchParams;
    const tab = q.get("tab") || "all";
    if (tab !== "all" && tab !== "requests") throw new ApiError("Invalid tab", 400);
    return chatService.listConversations({ userId, tab, cursor: q.get("cursor") || null });
}, { context: "api/chat/conversations", limiter: rateLimiters.api });
