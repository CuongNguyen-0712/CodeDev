import { readFileSync } from "node:fs";

// CodeDev: POST /v1/enrollments. Validate the request body at the edge, before EnrollmentService
// runs, the way a NestJS ValidationPipe does with an EnrollRequestDto - but in plain TypeScript.
//
// validateEnrollRequest(body) receives the parsed JSON body (it can be any JSON value) and returns
//   { ok: true, value: EnrollRequest }      when every field is valid, or
//   { ok: false, errors: FieldError[] }      with EVERY invalid field, at most one error per field,
//                                            in this order: courseId, email, plan, referralCode.
//
// A field is "missing" when it is absent or null. code is "required" for a missing required field,
// and "invalid" for a value that is present but has the wrong type or format.
//
//   courseId      required. A string of 3 to 64 characters: lowercase letters a-z and digits, in
//                 groups joined by single hyphens ("sql-data-modeling", "nodejs-101").
//                 No leading, trailing or double hyphens. Not trimmed.
//   email         required. A string. Trim surrounding whitespace first, then it must have no spaces,
//                 exactly one "@", a non-empty part before it, and after it a domain that contains a
//                 dot with at least one character on each side of every dot. The cleaned value is the
//                 trimmed email in lowercase.
//   plan          required. Exactly "free" or "premium" (case-sensitive: "Premium" is invalid).
//   referralCode  optional: missing (absent or null) is fine and it is left out of the value.
//                 Otherwise a string of 6 to 12 characters, uppercase letters A-Z and digits only.
//
// The value has the keys courseId, email, plan, and referralCode only when it was given.
// When the body itself is not a JSON object (an array, a string, a number...), return
// { ok: false, errors: [{ field: "body", code: "invalid" }] }.

type Plan = "free" | "premium";

interface EnrollRequest {
    courseId: string;
    email: string;
    plan: Plan;
    referralCode?: string;
}

interface FieldError {
    field: "body" | "courseId" | "email" | "plan" | "referralCode";
    code: "required" | "invalid";
}

type ValidationResult = { ok: true; value: EnrollRequest } | { ok: false; errors: FieldError[] };

const COURSE_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const REFERRAL = /^[A-Z0-9]{6,12}$/;

function isMissing(v: unknown): boolean {
    return v === undefined || v === null;
}

function isEmail(v: string): boolean {
    if (/\s/.test(v)) return false;
    const parts = v.split("@");
    if (parts.length !== 2 || parts[0] === "") return false;
    const labels = parts[1].split(".");
    return labels.length >= 2 && labels.every((label) => label !== "");
}

function validateEnrollRequest(body: unknown): ValidationResult {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { ok: false, errors: [{ field: "body", code: "invalid" }] };
    }
    const b = body as Record<string, unknown>;
    const errors: FieldError[] = [];

    const courseId = b.courseId;
    if (isMissing(courseId)) errors.push({ field: "courseId", code: "required" });
    else if (typeof courseId !== "string" || courseId.length < 3 || courseId.length > 64 || !COURSE_ID.test(courseId)) {
        errors.push({ field: "courseId", code: "invalid" });
    }

    const rawEmail = b.email;
    const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
    if (isMissing(rawEmail)) errors.push({ field: "email", code: "required" });
    else if (typeof rawEmail !== "string" || !isEmail(email)) errors.push({ field: "email", code: "invalid" });

    const plan = b.plan;
    if (isMissing(plan)) errors.push({ field: "plan", code: "required" });
    else if (plan !== "free" && plan !== "premium") errors.push({ field: "plan", code: "invalid" });

    const referralCode = b.referralCode;
    if (!isMissing(referralCode) && (typeof referralCode !== "string" || !REFERRAL.test(referralCode))) {
        errors.push({ field: "referralCode", code: "invalid" });
    }

    if (errors.length > 0) return { ok: false, errors };
    const value: EnrollRequest = { courseId: courseId as string, email, plan: plan as Plan };
    if (!isMissing(referralCode)) value.referralCode = referralCode as string;
    return { ok: true, value };
}

// ---------------------------------------------------------------- test runner (do not change)
const body: unknown = JSON.parse(readFileSync(0, "utf8"));
console.log(JSON.stringify(validateEnrollRequest(body)));
