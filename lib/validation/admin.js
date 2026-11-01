import { z } from "zod";

import { publicId } from "@/lib/validation/premium";

/** Admin user management inputs (docs/admin-panel-plan.md 02). Sensitive actions need a reason. */
const reason = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

export const adminUserListSchema = z.object({
    tab: z.enum(["all", "active", "unverified", "suspended", "blocked"]).default("all"),
    q: z.string().trim().max(100).default(""),
    role: z.string().trim().regex(/^[a-z_]{1,50}$/).optional(),
    cursor: z.string().trim().max(200).optional(),
});

export const adminUserActivitySchema = z.object({
    kinds: z.string().trim().max(100).optional()
        .transform((value) => (value ? value.split(",").filter((kind) => /^[a-z]{1,20}$/.test(kind)) : [])),
    before: z.string().trim().max(40).optional(),
});

export const adminUserStatusSchema = z.object({
    status: z.enum(["active", "suspended", "blocked"]),
    until: z.string().datetime({ offset: true }).optional(),
    reason,
});

export const adminUserRoleSchema = z.object({
    role: z.string().trim().regex(/^[a-z_]{1,50}$/, "Invalid role"),
    reason,
});

export const adminReasonSchema = z.object({ reason });

export { publicId };

export const adminRunListSchema = z.object({
    tab: z.enum(["active", "failed", "timeout", "all"]).default("active"),
    language: z.string().trim().regex(/^[a-z0-9+#-]{1,20}$/).optional(),
    type: z.enum(["manual", "submit"]).optional(),
    user: publicId.optional(),
    cursor: z.string().trim().max(200).optional(),
});

export const adminChallengeListSchema = z.object({ course: publicId });

export const adminChallengePatchSchema = z.object({
    status: z.enum(["coming_soon", "open", "closed"]).optional(),
    isPublished: z.boolean().optional(),
    points: z.number().int().min(0).max(10000).optional(),
    reason,
}).refine((value) => value.status !== undefined || value.isPublished !== undefined || value.points !== undefined, "Nothing to change");

export const adminAuditListSchema = z.object({
    actor: z.string().trim().max(255).default(""),
    action: z.string().trim().regex(/^[a-z_.]{0,60}$/).default(""),
    target: z.string().trim().regex(/^[a-z_]{0,40}$/).default(""),
    targetId: z.string().trim().max(100).default(""),
    range: z.enum(["1h", "24h", "7d", "30d", "all"]).default("7d"),
    before: z.string().trim().regex(/^\d{1,19}$/).optional(),
});

export const adminStructureChangeSchema = z.object({
    kind: z.enum(["module", "lesson"]),
    itemId: z.string().regex(/^\d{1,19}$/, "Invalid id"),
    hidden: z.boolean().optional(),
    move: z.enum(["up", "down"]).optional(),
    reason: z.string().trim().min(5, "Give a reason").max(500),
}).refine((value) => (value.hidden === undefined) !== (value.move === undefined), "Either hide / show or move");

const catalogKind = z.enum(["category", "language", "skill", "career_role", "industry", "learning_goal"]);
const auditReason = z.string().trim().min(5, "Give a reason").max(500);

export const adminCatalogListSchema = z.object({ kind: catalogKind });
export const adminCatalogCreateSchema = z.object({
    kind: catalogKind,
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().regex(/^[a-z0-9_]{2,60}$/, "Lower-case letters, digits and _").optional(),
    reason: auditReason,
});
export const adminCatalogUpdateSchema = z.object({
    name: z.string().trim().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
    reason: auditReason,
}).refine((value) => value.name !== undefined || value.isActive !== undefined, "Nothing to change");
export const adminCatalogParamsSchema = z.object({ kind: catalogKind, id: z.string().regex(/^\d{1,19}$/) });
export const adminCatalogDeleteSchema = z.object({ reason: auditReason });

// A 6-digit code from the authenticator app, or a recovery code (xxxxx-xxxxx).
export const adminMfaCodeSchema = z.object({ code: z.string().trim().min(6).max(20) });
