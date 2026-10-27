import { readFileSync } from "node:fs";

// Ship a Breaking Change Safely. Release 2026.10.22-2 of the CodeDev API "cleaned up" the course
// DTO: it renamed `rating` to `averageRating` and `instructor` to `teacher`, and turned `price`
// into a string. Android 3.8 (40% of Android users, cannot be force-updated for two weeks) still
// reads `rating`, `instructor` and an integer `price`, and crashes on every catalog response.
//
// Fix the mapper with expand/contract: every course response carries the old fields with their
// old types AND the new fields, so app 3.8 and the new web app both work:
//   old (deprecated): rating (number or null, key always present), instructor { id, name },
//                     price (integer, in dong)
//   new:              averageRating (number or null, key always present), teacher { id, name },
//                     priceAmount (the price in dong as a decimal string without separators, "149000")
//   unchanged:        id, slug, title, ratingCount
//
// deprecationHeaders(policy) announces the deprecated fields on every course response:
//   Deprecation: "@" + policy.deprecatedAt in whole Unix seconds, rounded down (RFC 9745 form)
//   Sunset:      policy.sunsetAt as an HTTP-date, e.g. "Mon, 30 Nov 2026 00:00:00 GMT" (RFC 8594);
//                no Sunset header at all when policy.sunsetAt is null (no date decided yet)
// It throws an Error when a date cannot be parsed, or when sunsetAt is earlier than 14 days after
// deprecatedAt (app 3.8 cannot be force-updated sooner). Exactly 14 days is allowed.
// Do not change CourseRow, the policy type or the test runner.

type CourseRow = {
    id: string;
    slug: string;
    title: string;
    ratingAvg: number | null; // null while the course has no reviews
    ratingCount: number;
    instructorId: string;
    instructorName: string;
    priceVnd: number; // integer dong, 0 = free
};

type DeprecationPolicy = { deprecatedAt: string; sunsetAt: string | null };

type Person = { id: string; name: string };
type CourseDto = {
    id: string;
    slug: string;
    title: string;
    /** @deprecated use averageRating */
    rating: number | null;
    averageRating: number | null;
    ratingCount: number;
    /** @deprecated use teacher */
    instructor: Person;
    teacher: Person;
    /** @deprecated use priceAmount */
    price: number;
    priceAmount: string;
};

const MIN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function toCourseDto(row: CourseRow): CourseDto {
    return {
        id: row.id,
        slug: row.slug,
        title: row.title,
        rating: row.ratingAvg,
        averageRating: row.ratingAvg,
        ratingCount: row.ratingCount,
        instructor: { id: row.instructorId, name: row.instructorName },
        teacher: { id: row.instructorId, name: row.instructorName },
        price: String(row.priceVnd) as unknown as number,
        priceAmount: String(row.priceVnd),
    };
}

function deprecationHeaders(policy: DeprecationPolicy): Record<string, string> {
    const deprecatedMs = Date.parse(policy.deprecatedAt);
    if (Number.isNaN(deprecatedMs)) throw new Error(`invalid deprecatedAt: ${policy.deprecatedAt}`);
    const headers: Record<string, string> = { Deprecation: `@${Math.floor(deprecatedMs / 1000)}` };
    if (policy.sunsetAt === null) return headers;
    const sunsetMs = Date.parse(policy.sunsetAt);
    if (Number.isNaN(sunsetMs)) throw new Error(`invalid sunsetAt: ${policy.sunsetAt}`);
    if (sunsetMs < deprecatedMs + MIN_WINDOW_MS) throw new Error("sunset is less than 14 days after deprecation");
    headers.Sunset = new Date(sunsetMs).toUTCString();
    return headers;
}

// ---------------------------------------------------------------- test runner (do not change)
// Validates every response against the schema app 3.8 decodes (old client) and the schema the
// new web app decodes (new client), field by field, including the values taken from the row.
type Check = (dto: Record<string, unknown>, row: CourseRow) => string[];

const isInt = (v: unknown) => typeof v === "number" && Number.isInteger(v);
const isNumOrNull = (v: unknown) => v === null || typeof v === "number";
function person(dto: Record<string, unknown>, key: string, row: CourseRow): string[] {
    if (!(key in dto)) return [`${key}: missing`];
    const v = dto[key] as { id?: unknown; name?: unknown } | null;
    if (typeof v !== "object" || v === null || Array.isArray(v)) return [`${key}: expected object, got ${JSON.stringify(v)}`];
    if (v.id !== row.instructorId || v.name !== row.instructorName) return [`${key}: expected ${row.instructorId}/${row.instructorName}`];
    return [];
}
function common(dto: Record<string, unknown>, row: CourseRow): string[] {
    const errors: string[] = [];
    for (const key of ["id", "slug", "title"] as const) {
        if (dto[key] !== row[key]) errors.push(`${key}: expected ${JSON.stringify(row[key])}`);
    }
    if (!isInt(dto.ratingCount) || dto.ratingCount !== row.ratingCount) errors.push("ratingCount: expected integer");
    return errors;
}
const oldClient: Check = (dto, row) => {
    const errors = common(dto, row);
    if (!("rating" in dto)) errors.push("rating: missing");
    else if (!isNumOrNull(dto.rating) || dto.rating !== row.ratingAvg) errors.push(`rating: got ${JSON.stringify(dto.rating)}`);
    errors.push(...person(dto, "instructor", row));
    if (!("price" in dto)) errors.push("price: missing");
    else if (!isInt(dto.price) || dto.price !== row.priceVnd) errors.push(`price: expected integer, got ${JSON.stringify(dto.price)}`);
    return errors;
};
const newClient: Check = (dto, row) => {
    const errors = common(dto, row);
    if (!("averageRating" in dto)) errors.push("averageRating: missing");
    else if (!isNumOrNull(dto.averageRating) || dto.averageRating !== row.ratingAvg) errors.push(`averageRating: got ${JSON.stringify(dto.averageRating)}`);
    errors.push(...person(dto, "teacher", row));
    if (!("priceAmount" in dto)) errors.push("priceAmount: missing");
    else if (typeof dto.priceAmount !== "string" || dto.priceAmount !== String(row.priceVnd)) errors.push(`priceAmount: got ${JSON.stringify(dto.priceAmount)}`);
    return errors;
};

const input: { policy: DeprecationPolicy; rows: CourseRow[] } = JSON.parse(readFileSync(0, "utf8"));
const report = (check: Check) => {
    const failed: string[] = [];
    for (const row of input.rows) {
        const dto = JSON.parse(JSON.stringify(toCourseDto(row))) as Record<string, unknown>;
        const errors = check(dto, row);
        if (errors.length) failed.push(`${row.id}: ${errors.join("; ")}`);
    }
    return { failed: failed.length, firstErrors: failed.slice(0, 3) };
};
let headers: Record<string, string> | null = null;
try {
    headers = deprecationHeaders(input.policy);
} catch {
    console.log(JSON.stringify({ error: "invalid deprecation policy" }));
}
if (headers) {
    console.log(JSON.stringify({ responses: input.rows.length, headers, oldClient: report(oldClient), newClient: report(newClient) }));
}
