import { ApiError } from "@/lib/error/apiError";
import { requirePermission } from "@/lib/authz";
import { RateLimiter, rateLimiters } from "@/lib/rateLimit";
import { apiRoute } from "@/lib/routeHandler";
import { adminChatReportActionSchema } from "@/lib/validation/admin";
import { parseOrThrow, readJson } from "@/lib/validation/premium";
import { adminChatService } from "@/services/adminChat.service";

const MESSAGE_ID = /^msg_[0-9a-z]{26}$/;

// PATCH { action: hide|dismiss, reason }: [id] is the message's public id (audited).
export const PATCH = apiRoute(
    async ({ req, userId, params }) => {
        const actor = await requirePermission(userId, ["admin.read", "chat.moderate"]);
        if (!MESSAGE_ID.test(params.id ?? "")) throw new ApiError("Invalid message id", 400);
        const input = parseOrThrow(adminChatReportActionSchema, await readJson(req));
        return adminChatService.act({ actor, messageId: params.id, ...input, ip: RateLimiter.getClientIp(req) });
    },
    { context: "api/admin/chat-reports/[id]", csrf: true, limiter: rateLimiters.admin }
);
