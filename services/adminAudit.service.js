import { adminAuditDb } from "@/db/adminAudit.db";
import { actorCan } from "@/lib/authz";

/** Audit screen (docs/admin-panel-plan.md 06): filters, keyset paging, IP addresses only with user.pii. */
export const adminAuditService = {
    list: async ({ actor, filters, beforeId }) => {
        const [{ rows }, facets] = await Promise.all([
            adminAuditDb.list({ ...filters, beforeId, limit: 51 }),
            beforeId ? Promise.resolve(null) : adminAuditDb.facets(filters.range),
        ]);
        const pii = actorCan(actor, "user.pii");
        const page = rows.slice(0, 50);
        return {
            items: page.map((row) => ({ ...row, ip_address: pii ? row.ip_address : row.ip_address ? "hidden" : null })),
            nextBefore: rows.length > 50 ? page[page.length - 1].id : null,
            facets,
        };
    },
};
