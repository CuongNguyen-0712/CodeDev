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
