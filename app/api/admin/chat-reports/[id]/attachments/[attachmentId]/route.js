import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/authz";
import { chatId } from "@/lib/chat/routeParams";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminChatService } from "@/services/adminChat.service";

// An image of a reported message (open reports only, audited); [id] is the message's public id.
// The api limiter, not admin's: one page of reports loads up to a few dozen thumbnails.
export const GET = apiRoute(async ({ req, userId, params }) => {
    const actor = await requirePermission(userId, ["admin.read", "chat.moderate"]);
    const url = await adminChatService.attachmentUrl({
        actor, messageId: chatId("msg", params.id), attachmentId: chatId("att", params.attachmentId), ip: RateLimiter.getClientIp(req),
    });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=240" } });
}, { context: "api/admin/chat-reports/[id]/attachments/[attachmentId]", limiter: rateLimiters.api });
