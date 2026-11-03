import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminSettingsService } from "@/services/adminSettings.service";

// GET: read-only configuration and the role / permission matrix (names only, never secret values).
export const GET = apiRoute(
    async ({ userId }) => {
        await requirePermission(userId, ["admin.read", "platform.settings"]);
        return adminSettingsService.overview();
    },
    { context: "api/admin/settings" }
);
