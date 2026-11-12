import { NextResponse } from "next/server";

import { chatId } from "@/lib/chat/routeParams";
import { rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { chatService } from "@/services/chat.service";

// Short-lived signed URL; the browser may reuse the redirect a little less than the URL's life.
export const GET = apiRoute(async ({ userId, params }) => {
    const url = await chatService.attachmentReadUrl({ userId, attachmentId: chatId("att", params.id) });
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=240" } });
}, { context: "api/chat/attachments/[id]", limiter: rateLimiters.api });
