import { readFileSync } from "node:fs";

// POST /enrollments request validation. In the NestJS app a ValidationPipe and the EnrollDto do this job;
// the code runner has no NestJS, so you write the same rules as one plain function.
//
// validateEnrollRequest(body) receives the parsed JSON body exactly as the client sent it and returns
//   { ok: true, value }    - value has courseId, email, plan, seats and couponCode (only when one was given)
//   { ok: false, errors }  - one { field, message } per invalid field, in the order
//                            courseId, email, plan, couponCode, seats (the first rule a field fails)
//
// Rules ("missing" means the key is absent or its value is null):
//   body       not a JSON object (null, an array, a string, a number)
//              -> the only error: body "body must be a JSON object"
//   courseId   missing -> "courseId is required"; not a string -> "courseId must be a string";
//              not c_ followed by 1 to 9 digits (/^c_[0-9]{1,9}$/) -> "courseId must be c_ followed by 1 to 9 digits"
//   email      missing -> "email is required"; not a string -> "email must be a string";
//              longer than 254 characters or not matching /^[^\s@]+@[^\s@]+\.[^\s@]+$/
//              -> "email must be a valid email address"
//   plan       missing -> "plan is required"; not a string -> "plan must be a string";
//              not exactly "free" or "premium" -> "plan must be one of: free, premium"
//   couponCode optional (missing = no coupon); not a string -> "couponCode must be a string";
//              not 4 to 12 characters A-Z or 0-9 -> "couponCode must be 4 to 12 characters, A-Z or 0-9";
//              a well-formed coupon with plan "free" -> "couponCode is only allowed with plan premium"
//   seats      optional (missing = 1); not a number or not an integer -> "seats must be an integer";
//              below 1 or above 50 -> "seats must be between 1 and 50"
//
// Never convert or trim a value: "PREMIUM", "2" and " c_12" are errors, not guesses.
// Ignore any other key in the body (it never reaches value). Do not change the types or the test runner.

const PLANS = ["free", "premium"] as const;
type Plan = (typeof PLANS)[number];

type EnrollRequest = { courseId: string; email: string; plan: Plan; seats: number; couponCode?: string };
type FieldError = { field: string; message: string };
type ValidationResult = { ok: true; value: EnrollRequest } | { ok: false; errors: FieldError[] };

function validateEnrollRequest(body: unknown): ValidationResult {
    return { ok: false, errors: [] };
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
