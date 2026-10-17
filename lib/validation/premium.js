import { z } from "zod";

import { ApiError } from "@/lib/error/apiError";

/**
 * Request schemas for onboarding, commerce and admin APIs. Everything a client sends is parsed
 * here; prices, user ids of the caller and statuses the server decides are never accepted.
 */

export const ONBOARDING_STEPS = ["role", "industry", "level_goals", "review", "recommendations"];
export const EXPERIENCE_LEVELS = ["beginner", "junior", "intermediate", "advanced"];
export const PUBLISH_STATUSES = ["draft", "published", "unpublished", "archived"];
export const ACCESS_MODELS = ["free", "premium"];
export const COURSE_TYPES = ["course", "project", "workshop"];
export const COURSE_LEVELS = ["beginner", "intermediate", "advanced", "expert", "master"];

const code = z.string().trim().regex(/^[a-z0-9_]{1,50}$/, "Invalid code");
const codeList = (max) => z.array(code).max(max).transform((list) => [...new Set(list)]);
export const publicId = z.string().trim().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid id");
export const idempotencyKey = z.string().trim().regex(/^[A-Za-z0-9_-]{8,100}$/, "Invalid request key");

export const onboardingStepSchema = z.object({
    step: z.enum(["role", "industry", "level_goals", "review"]),
    roleCode: code.optional(),
    industryCodes: codeList(12).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).optional(),
    goalCodes: codeList(10).optional(),
    preferredLanguageId: z.number().int().positive().max(2_147_483_647).nullable().optional(),
}).strict().superRefine((value, ctx) => {
    if (value.step === "role" && !value.roleCode) {
        ctx.addIssue({ code: "custom", path: ["roleCode"], message: "Choose a role" });
    }
    if (value.step === "level_goals") {
        if (!value.experienceLevel) ctx.addIssue({ code: "custom", path: ["experienceLevel"], message: "Choose your experience level" });
        if (!value.goalCodes?.length) ctx.addIssue({ code: "custom", path: ["goalCodes"], message: "Choose at least one goal" });
    }
});

export const preferencesPatchSchema = z.object({
    roleCode: code.nullable().optional(),
    industryCodes: codeList(12).optional(),
    experienceLevel: z.enum(EXPERIENCE_LEVELS).nullable().optional(),
    goalCodes: codeList(10).optional(),
    preferredLanguageId: z.number().int().positive().max(2_147_483_647).nullable().optional(),
}).strict();

export const purchaseSchema = z.object({
    courseId: publicId,
    idempotencyKey,
}).strict();

export const adminCoursePatchSchema = z.object({
    accessModel: z.enum(ACCESS_MODELS).optional(),
    courseType: z.enum(COURSE_TYPES).optional(),
    level: z.enum(COURSE_LEVELS).optional(),
    skills: z.array(z.object({ code, weight: z.number().int().min(1).max(5) }).strict()).max(30).optional(),
    roleCodes: codeList(20).optional(),
    industryCodes: codeList(20).optional(),
    goalCodes: codeList(20).optional(),
    prerequisiteIds: z.array(publicId).max(10).transform((list) => [...new Set(list)]).optional(),
    reason: z.string().trim().max(500).optional(),
}).strict();

export const adminPublishSchema = z.object({
    status: z.enum(PUBLISH_STATUSES),
    reason: z.string().trim().max(500).optional(),
}).strict();

export const adminOfferSchema = z.object({
    priceType: z.enum(["money", "points"]),
    amount: z.number().int().positive().max(1_000_000_000),
    currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(),
    reason: z.string().trim().max(500).optional(),
}).strict().superRefine((value, ctx) => {
    if (value.priceType === "money" && !value.currency) {
        ctx.addIssue({ code: "custom", path: ["currency"], message: "Currency is required for a money price" });
    }
    if (value.priceType === "points" && value.currency) {
        ctx.addIssue({ code: "custom", path: ["currency"], message: "A points price has no currency" });
    }
});

export const adminOfferDeleteSchema = z.object({
    priceType: z.enum(["money", "points"]),
    reason: z.string().trim().max(500).optional(),
}).strict();

export const adminPointsAdjustSchema = z.object({
    userId: publicId,
    amount: z.number().int().refine((n) => n !== 0, "Amount cannot be 0").refine((n) => Math.abs(n) <= 1_000_000, "Amount is too large"),
    reason: z.string().trim().min(5, "Give a reason").max(500),
    idempotencyKey,
}).strict();

export const adminRefundSchema = z.object({
    reason: z.string().trim().min(5, "Give a reason").max(500),
}).strict();

export const adminGrantSchema = z.object({
    userId: publicId,
    courseId: publicId,
    expiresAt: z.iso.datetime({ offset: true }).optional(),
    reason: z.string().trim().min(5, "Give a reason").max(500),
}).strict();

export const adminRevokeSchema = z.object({
    entitlementId: publicId,
    reason: z.string().trim().min(5, "Give a reason").max(500),
}).strict();

/** Parses `data` or throws ApiError 400 with the first issue (field: message). */
export function parseOrThrow(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const issue = result.error.issues[0];
        const field = issue?.path?.length ? `${issue.path.join(".")}: ` : "";
        throw new ApiError(`${field}${issue?.message || "Invalid request"}`, 400, { code: "INVALID_REQUEST" });
    }
    return result.data;
}

/** Reads a JSON body (max ~16 KB) or throws ApiError 400. */
export async function readJson(req, maxBytes = 16 * 1024) {
    const text = await req.text();
    if (text.length > maxBytes) throw new ApiError("Request body is too large", 413);
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        throw new ApiError("Invalid JSON body", 400, { code: "INVALID_REQUEST" });
    }
}
