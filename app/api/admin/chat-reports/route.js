import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminChatService } from "@/services/adminChat.service";

// GET ?cursor=: messages with open reports, oldest report first.
export const GET = apiRoute(
    async ({ req, userId }) => {
        await requirePermission(userId, ["admin.read", "chat.moderate"]);
        return adminChatService.list({ cursor: new URL(req.url).searchParams.get("cursor") || null });
    },
    { context: "api/admin/chat-reports" }
);
