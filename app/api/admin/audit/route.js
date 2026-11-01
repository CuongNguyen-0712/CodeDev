import { requirePermission } from "@/lib/authz";
import { apiRoute } from "@/lib/routeHandler";
import { adminAuditListSchema } from "@/lib/validation/admin";
import { parseOrThrow } from "@/lib/validation/premium";
import { adminAuditService } from "@/services/adminAudit.service";

// GET ?actor=&action=&target=&targetId=&range=1h|24h|7d|30d|all&before=<id>: audit entries, newest first.
export const GET = apiRoute(
    async ({ req, userId }) => {
        const actor = await requirePermission(userId, ["admin.read", "audit.read"]);
        const input = parseOrThrow(adminAuditListSchema, Object.fromEntries(new URL(req.url).searchParams));
        const { before, target, ...rest } = input;
        return adminAuditService.list({ actor, filters: { ...rest, targetType: target }, beforeId: before });
    },
    { context: "api/admin/audit" }
);
