import { readFileSync } from "node:fs";

// POST /enrollments request validation (reference solution).

const PLANS = ["free", "premium"] as const;
type Plan = (typeof PLANS)[number];

type EnrollRequest = { courseId: string; email: string; plan: Plan; seats: number; couponCode?: string };
type FieldError = { field: string; message: string };
type ValidationResult = { ok: true; value: EnrollRequest } | { ok: false; errors: FieldError[] };

const COURSE_ID = /^c_[0-9]{1,9}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COUPON = /^[A-Z0-9]{4,12}$/;

function validateEnrollRequest(body: unknown): ValidationResult {
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
        return { ok: false, errors: [{ field: "body", message: "body must be a JSON object" }] };
    }
    const b = body as Record<string, unknown>;
    const errors: FieldError[] = [];
    const missing = (v: unknown) => v === undefined || v === null;

    // required strings: the first rule that fails is the field's only error
    const requiredString = (field: string): string | undefined => {
        const v = b[field];
        if (missing(v)) errors.push({ field, message: `${field} is required` });
        else if (typeof v !== "string") errors.push({ field, message: `${field} must be a string` });
        else return v;
        return undefined;
    };

    let courseId = requiredString("courseId");
    if (courseId !== undefined && !COURSE_ID.test(courseId)) {
        errors.push({ field: "courseId", message: "courseId must be c_ followed by 1 to 9 digits" });
        courseId = undefined;
    }
    let email = requiredString("email");
    if (email !== undefined && (email.length > 254 || !EMAIL.test(email))) {
        errors.push({ field: "email", message: "email must be a valid email address" });
        email = undefined;
    }
    const planText = requiredString("plan");
    let plan: Plan | undefined;
    if (planText !== undefined) {
        plan = PLANS.find((p) => p === planText);
        if (plan === undefined) errors.push({ field: "plan", message: "plan must be one of: free, premium" });
    }

    let couponCode: string | undefined;
    const coupon = b.couponCode;
    if (!missing(coupon)) {
        if (typeof coupon !== "string") errors.push({ field: "couponCode", message: "couponCode must be a string" });
        else if (!COUPON.test(coupon)) errors.push({ field: "couponCode", message: "couponCode must be 4 to 12 characters, A-Z or 0-9" });
        else if (plan === "free") errors.push({ field: "couponCode", message: "couponCode is only allowed with plan premium" });
        else couponCode = coupon;
    }

    let seats = 1;
    const s = b.seats;
    if (!missing(s)) {
        if (typeof s !== "number" || !Number.isInteger(s)) errors.push({ field: "seats", message: "seats must be an integer" });
        else if (s < 1 || s > 50) errors.push({ field: "seats", message: "seats must be between 1 and 50" });
        else seats = s;
    }

    if (errors.length > 0 || courseId === undefined || email === undefined || plan === undefined) {
        return { ok: false, errors };
    }
    const value: EnrollRequest = { courseId, email, plan, seats };
    if (couponCode !== undefined) value.couponCode = couponCode;
    return { ok: true, value };
}

// ---------------------------------------------------------------- test runner (do not change)
// Input: { "bodies": [ ...request bodies... ] } or { "generate": { "count": n, "seed": s } }.
// Each body prints one line: "#n ok <value fields>" or "#n rejected <field>: <message> | ...".
// With "generate", only a summary is printed: valid bodies, and the errors counted per field.
type Test = { bodies?: unknown[]; generate?: { count: number; seed: number } };

function describe(result: ValidationResult): string {
    if (result && result.ok === true && result.value && typeof result.value === "object") {
        const v = result.value;
        return `ok courseId=${JSON.stringify(v.courseId)} email=${JSON.stringify(v.email)} plan=${JSON.stringify(v.plan)} seats=${JSON.stringify(v.seats)} couponCode=${v.couponCode === undefined ? "-" : JSON.stringify(v.couponCode)}`;
    }
    if (result && result.ok === false && Array.isArray(result.errors)) {
        if (result.errors.length === 0) return "rejected with no errors";
        return `rejected ${result.errors.map((e) => `${e.field}: ${e.message}`).join(" | ")}`;
    }
    return `invalid result ${JSON.stringify(result)}`;
}

function generate(count: number, seed: number): unknown[] {
    let x = seed >>> 0;
    const pick = <T>(list: T[]): T => {
        x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
        return list[(x >>> 16) % list.length];
    };
    const courseIds = ["c_1042", "c_7", "c_123456789", "c_42", "c_1042", "c_88", "c_31", "c_7", "c_42", "c_9", "C_12", "c_", "c_12a", " c_12", "c_1234567890", 1042, null, undefined];
    const emails = ["ana@codedev.test", "minh.tran@example.com", "a@b.co", "ana@codedev.test", "a@b.co", "ana@codedev.test", "minh.tran@example.com", "lan@codedev.test", "no-at-sign.example.com", "two@@example.com", "space @example.com", "x@localhost", "", 7, null, undefined];
    const plans = ["free", "premium", "premium", "free", "free", "premium", "premium", "free", "premium", "free", "PREMIUM", "Premium", "premium ", "", "gold", 1, null, undefined];
    const coupons = [undefined, undefined, undefined, undefined, undefined, undefined, null, "SPRING25", "AB12", "TOOLONGCOUPON1", "abc1", "AB", 25];
    const seats = [undefined, undefined, undefined, undefined, null, 1, 2, 50, 51, 0, -1, 2.5, "2", true];
    const bodies: unknown[] = [];
    for (let i = 0; i < count; i++) {
        const shape = pick([0, 0, 0, 0, 0, 0, 0, 0, 1, 2]);
        if (shape === 1) { bodies.push(pick([null, [], "plan=premium", 42])); continue; }
        const body: Record<string, unknown> = {};
        const add = (key: string, value: unknown) => { if (value !== undefined) body[key] = value; };
        add("courseId", pick(courseIds));
        add("email", pick(emails));
        add("plan", pick(plans));
        add("couponCode", pick(coupons));
        add("seats", pick(seats));
        if (shape === 2) body.isAdmin = true;
        bodies.push(body);
    }
    return bodies;
}

const test: Test = JSON.parse(readFileSync(0, "utf8"));
if (test.generate) {
    const bodies = generate(test.generate.count, test.generate.seed);
    const perField = new Map<string, number>();
    let valid = 0;
    for (const body of bodies) {
        const result = validateEnrollRequest(body);
        if (result.ok) valid++;
        else for (const e of result.errors) perField.set(e.field, (perField.get(e.field) ?? 0) + 1);
    }
    const fields = ["body", "courseId", "email", "plan", "couponCode", "seats"].map((f) => `${f} ${perField.get(f) ?? 0}`);
    console.log(`${bodies.length} bodies: ${valid} valid; errors ${fields.join(", ")}`);
} else {
    (test.bodies ?? []).forEach((body, i) => console.log(`#${i + 1} ${describe(validateEnrollRequest(body))}`));
}
