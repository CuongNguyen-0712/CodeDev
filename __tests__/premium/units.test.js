import { describe, expect, it } from "vitest";

import { normaliseProfile, rankCourses, scoreCourse } from "@/services/recommendation.service";
import { computeSignature, signatureHeader, verifySignatureHeader } from "@/services/payments/signature";
import { ownershipChangeKeys } from "@/mutations/premium.mutation";
import { commerceKeys } from "@/keys/commerce.keys";
import { onboardingKeys } from "@/keys/onboarding.keys";
import { courseKeys } from "@/keys/course.keys";
import { userKeys } from "@/keys/user.keys";
import { DB_BUSINESS_ERRORS, toSafeError } from "@/lib/error/apiError";
import { onboardingStepSchema, purchaseSchema } from "@/lib/validation/premium";

/** Recommendation rules, webhook signatures, cache invalidation lists: no database needed. */

const course = (id, overrides = {}) => ({
    id,
    title: `Course ${id}`,
    level: "intermediate",
    rating: 4,
    students: 10,
    access_model: "free",
    language_id: 1,
    language_name: "JavaScript",
    skills: [],
    role_codes: [],
    industry_codes: [],
    goal_codes: [],
    prerequisites: [],
    roadmaps: [],
    ...overrides,
});

const backendProfile = (overrides = {}) => normaliseProfile({
    role_code: "backend_developer",
    role_name: "Backend Developer",
    experience_level: "intermediate",
    role_skills: [{ code: "nodejs", name: "Node.js", weight: 4 }, { code: "sql", name: "SQL", weight: 5 }],
    industry_codes: ["fintech"],
    goal_codes: ["grow_in_role"],
    enrolments: [],
    owned_course_ids: [],
    ...overrides,
});

describe("recommendations (rules)", () => {
    it("explains every positive score with a reason", () => {
        const result = scoreCourse(backendProfile(), course("a", {
            role_codes: ["backend_developer"],
            skills: [{ code: "nodejs", name: "Node.js", weight: 5 }],
            goal_codes: ["grow_in_role"],
        }));
        expect(result.score).toBeGreaterThan(0);
        expect(result.reasons.map((r) => r.text)).toEqual(expect.arrayContaining([
            "Built for Backend Developers",
            expect.stringContaining("Teaches Node.js"),
            "Serves one of your goals",
            "Matches your intermediate level",
        ]));
    });

    it("never ranks a course higher because it is more expensive", () => {
        const base = { role_codes: ["backend_developer"], skills: [{ code: "sql", name: "SQL", weight: 3 }] };
        const cheap = course("b-free", { ...base, access_model: "free", cost: 0 });
        const pricey = course("a-premium", { ...base, access_model: "premium", cost: 9_999_999, point_price: 50_000 });

        const a = rankCourses(backendProfile(), [cheap, pricey]);
        const b = rankCourses(backendProfile(), [pricey, cheap]);
        expect(a.items[0].score).toBe(a.items[1].score);
        // Same order whatever the input order: ties break on rating, learners, id, never price.
        expect(a.items.map((i) => i.course.id)).toEqual(b.items.map((i) => i.course.id));
        expect(a.items.map((i) => i.course.id)).toEqual(["a-premium", "b-free"]);
    });

    it("does not recommend completed or in-progress courses as new", () => {
        const profile = backendProfile({
            enrolments: [{ course_id: "done", status: "completed" }, { course_id: "busy", status: "in_progress" }],
        });
        const result = rankCourses(profile, [
            course("done", { role_codes: ["backend_developer"] }),
            course("busy", { role_codes: ["backend_developer"] }),
            course("new", { role_codes: ["backend_developer"] }),
        ]);
        expect(result.items.map((i) => i.course.id)).toEqual(["new"]);
    });

    it("rewards completed prerequisites and warns about missing ones", () => {
        const profile = backendProfile({ enrolments: [{ course_id: "intro", status: "completed" }] });
        const next = course("next", { role_codes: ["backend_developer"], prerequisites: [{ id: "intro", title: "Intro" }] });
        const blocked = course("blocked", { role_codes: ["backend_developer"], prerequisites: [{ id: "other", title: "Other" }] });
        const result = rankCourses(profile, [blocked, next]);
        expect(result.items[0].course.id).toBe("next");
        expect(result.items[0].reasons).toContain("Builds on Intro, which you completed");
        expect(result.items[1].cautions).toContain("Take Other first");
    });

    it("falls back to popular courses when nothing matches, and to empty with no candidates", () => {
        const noPrefs = normaliseProfile({});
        const fallback = rankCourses(noPrefs, [course("x", { students: 5 }), course("y", { students: 50 })]);
        expect(fallback.fallback).toBe(true);
        expect(fallback.items.map((i) => i.course.id)).toEqual(["y", "x"]);
        expect(fallback.items[0].reasons).toEqual(["Popular with other learners"]);

        const empty = rankCourses(backendProfile(), []);
        expect(empty).toMatchObject({ items: [], fallback: true });
    });

    it("keeps owned courses visible but flags them, and ownership alone is not a match", () => {
        const profile = backendProfile({ owned_course_ids: ["mine"] });
        const result = rankCourses(profile, [course("mine", { role_codes: ["backend_developer"] }), course("other-unrelated", { level: "master" })]);
        expect(result.items.find((i) => i.course.id === "mine").owned).toBe(true);
        expect(result.items.find((i) => i.course.id === "other-unrelated")).toBeUndefined();
    });
});

describe("webhook signatures", () => {
    const secret = "test-secret-0123456789";
    const body = JSON.stringify({ id: "evt_1", type: "payment.succeeded" });

    it("accepts a fresh, matching signature", () => {
        expect(verifySignatureHeader(secret, body, signatureHeader(secret, body))).toBe(true);
    });

    it("rejects a tampered body, a wrong secret, a stale timestamp and garbage", () => {
        const header = signatureHeader(secret, body);
        expect(verifySignatureHeader(secret, body.replace("evt_1", "evt_2"), header)).toBe(false);
        expect(verifySignatureHeader("another-secret-0123456", body, header)).toBe(false);

        const old = Math.floor(Date.now() / 1000) - 3600;
        expect(verifySignatureHeader(secret, body, `t=${old},v1=${computeSignature(secret, old, body)}`)).toBe(false);

        expect(verifySignatureHeader(secret, body, "t=abc,v1=zz")).toBe(false);
        expect(verifySignatureHeader(secret, body, undefined)).toBe(false);
        expect(verifySignatureHeader("", body, header)).toBe(false);
    });
});

describe("cache invalidation after a purchase / redemption (client)", () => {
    it("refreshes balance, ownership, orders, recommendations, course lists and the navbar", () => {
        const keys = ownershipChangeKeys("course-1").map((key) => JSON.stringify(key));
        for (const expected of [commerceKeys.all, onboardingKeys.recommendationsAll(), userKeys.me(), courseKeys.all, courseKeys.details("course-1")]) {
            expect(keys).toContain(JSON.stringify(expected));
        }
        // Wallet / entitlements / orders are nested under commerceKeys.all (prefix match).
        expect(commerceKeys.wallet().slice(0, commerceKeys.all.length)).toEqual(commerceKeys.all);
        expect(commerceKeys.entitlements().slice(0, commerceKeys.all.length)).toEqual(commerceKeys.all);
    });
});

describe("request validation and error mapping", () => {
    it("never accepts a price or a user id from the client", () => {
        expect(purchaseSchema.safeParse({ courseId: "c1", idempotencyKey: "abcdefgh12", price: 1 }).success).toBe(false);
        expect(purchaseSchema.safeParse({ courseId: "c1", idempotencyKey: "abcdefgh12", userId: "u" }).success).toBe(false);
        expect(purchaseSchema.safeParse({ courseId: "c1; DROP TABLE", idempotencyKey: "abcdefgh12" }).success).toBe(false);
    });

    it("requires the data of each onboarding step", () => {
        expect(onboardingStepSchema.safeParse({ step: "role" }).success).toBe(false);
        expect(onboardingStepSchema.safeParse({ step: "level_goals", experienceLevel: "junior", goalCodes: [] }).success).toBe(false);
        expect(onboardingStepSchema.safeParse({ step: "level_goals", experienceLevel: "junior", goalCodes: ["first_job"] }).success).toBe(true);
    });

    it("maps database business errors to client-safe statuses and codes", () => {
        const error = Object.assign(new Error("Not enough points"), { code: "CD402" });
        expect(toSafeError(error)).toEqual({ status: 402, message: "Not enough points", code: "INSUFFICIENT_POINTS" });
        expect(Object.keys(DB_BUSINESS_ERRORS)).toEqual(expect.arrayContaining(["CD403", "CD409", "CD422"]));
    });
});
