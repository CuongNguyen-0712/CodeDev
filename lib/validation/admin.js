import { z } from "zod";

import { SEARCH_MAX, SEARCH_TYPES } from "@/lib/adminSearch";
import { publicId } from "@/lib/validation/premium";

/** Admin user management inputs (docs/admin-panel-plan.md 02). Sensitive actions need a reason. */
const reason = z.string().trim().min(10, "Give a reason of at least 10 characters").max(500);

// A calendar day from a date filter ("YYYY-MM-DD"), or nothing.
const isDay = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);
const day = z.string().trim().max(10).optional()
    .refine((value) => !value || isDay(value), "Invalid date")
    .transform((value) => value || undefined);

export const adminUserListSchema = z.object({
    tab: z.enum(["all", "active", "unverified", "suspended", "blocked"]).default("all"),
    q: z.string().trim().max(100).default(""),
    role: z.string().trim().regex(/^[a-z_]{1,50}$/).optional(),
    cursor: z.string().trim().max(200).optional(),
    sort: z.enum(["newest", "oldest", "seen"]).default("newest"),
    joinedFrom: day,
    joinedTo: day,
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

export const adminRatingHideSchema = z.object({ userId: publicId, hidden: z.boolean(), reason }).strict();
export const adminCommentHideSchema = z.object({ hidden: z.boolean(), reason }).strict();
export const adminChatReportActionSchema = z.object({ action: z.enum(["hide", "dismiss"]), reason: reason.optional() }).strict()
    .refine((value) => value.action !== "hide" || value.reason, { message: "Give a reason of at least 10 characters", path: ["reason"] });
export const adminFeedbackHandleSchema = z.object({ handled: z.boolean() }).strict();
export const adminCommentListSchema = z.object({
    course: publicId.optional(),
    state: z.enum(["all", "visible", "hidden", "downvoted"]).default("all"),
    cursor: z.string().max(200).optional(),
});
export const adminFeedbackListSchema = z.object({
    state: z.enum(["open", "handled", "all"]).default("open"),
    cursor: z.string().max(200).optional(),
});

export const adminAuditListSchema = z.object({
    actor: z.string().trim().max(255).default(""),
    action: z.string().trim().regex(/^[a-z0-9_.]{0,60}$/).default(""),
    target: z.string().trim().regex(/^[a-z_]{0,40}$/).default(""),
    targetId: z.string().trim().max(100).default(""),
    q: z.string().trim().max(100).default(""),
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

// Notifications sent by admins (docs/notification-plan.md 3). Plain text; links stay on this site.
const ROLE_CODES = ["user", "student", "instructor", "course_manager", "admin", "super_admin"];
const BACKSLASH = String.fromCharCode(92);
/** "/course/abc": one leading slash not followed by a second one; no spaces, backslashes or control characters. */
export const isSitePath = (value) => value.startsWith("/") && value[1] !== "/"
    && [...value].every((ch) => ch.charCodeAt(0) > 32 && ch.charCodeAt(0) !== 127 && ch !== BACKSLASH);
const announcementAudience = z.discriminatedUnion("type", [
    z.object({ type: z.literal("all") }).strict(),
    z.object({ type: z.literal("role"), roles: z.array(z.enum(ROLE_CODES)).min(1).max(ROLE_CODES.length) }).strict(),
    z.object({ type: z.literal("course"), courseId: publicId }).strict(),
    // Public ids or usernames; the service resolves them and rejects unknown ones.
    z.object({ type: z.literal("users"), userIds: z.array(z.string().trim().regex(/^[A-Za-z0-9_.-]{1,64}$/, "Invalid user")).min(1).max(100) }).strict(),
]);
export const adminAnnouncementAudienceSchema = z.object({ audience: announcementAudience }).strict();
export const adminAnnouncementSchema = z.object({
    title: z.string().trim().min(3, "Give a title").max(120),
    body: z.string().trim().min(3, "Write the message").max(1000),
    link: z.union([
        z.literal(""),
        z.string().trim().max(500).refine(isSitePath, "Use a path on this site, like /course/abc"),
    ]).optional(),
    audience: announcementAudience,
    sendAt: z.iso.datetime({ offset: true }).nullable().optional(),
}).strict();
export const adminAnnouncementActionSchema = z.object({
    action: z.enum(["cancel", "retract"]),
    reason: z.string().trim().max(500).optional(),
}).strict();
export const adminAnnouncementListSchema = z.object({ cursor: z.string().trim().max(200).optional() });

// Ctrl / Cmd + K: a longer query is cut, not refused (lib/adminSearch.js).
export const adminSearchSchema = z.object({
    q: z.string().default("").transform((value) => value.trim().slice(0, SEARCH_MAX)),
    type: z.enum(SEARCH_TYPES.map((item) => item.type)).optional(),
});

export const adminOrderListSchema = z.object({
    q: z.string().trim().max(100).default(""),
    status: z.enum(["pending", "completed", "cancelled", "refunded", "failed", "expired"]).optional(),
    from: day,
    to: day,
});
