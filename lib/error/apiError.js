import { NextResponse } from "next/server";

export class ApiError extends Error {
    /**
     * @param {string} message
     * @param {number} [status=500]
     * @param {{ code?: string, expose?: boolean, retryAfter?: number, details?: object }} [options]
     *   code: machine-readable error code returned to the client
     *   expose: return the message even for a 5xx (only for messages written for users)
     *   details: plain data the client needs to act on a 4xx (e.g. which fields are missing)
     */
    constructor(message, status = 500, { code, expose = false, retryAfter, details } = {}) {
        super(message);
        this.status = status;
        this.errorCode = code;
        this.expose = expose;
        if (retryAfter) this.retryAfter = retryAfter;
        if (details) this.details = details;
    }
}

const GENERIC_MESSAGE = "Something went wrong, please try again.";

/**
 * Business errors raised by the commerce / access SQL functions (SQLSTATE class CD, see
 * db/functions). Their messages are written for users.
 */
export const DB_BUSINESS_ERRORS = {
    CD400: { status: 400, code: "INVALID_REQUEST" },
    CD402: { status: 402, code: "INSUFFICIENT_POINTS" },
    CD403: { status: 403, code: "COURSE_ACCESS_REQUIRED" },
    CD404: { status: 404, code: "COURSE_UNAVAILABLE" },
    CD409: { status: 409, code: "ALREADY_OWNED" },
    CD410: { status: 409, code: "OFFER_UNAVAILABLE" },
    CD422: { status: 422, code: "IDEMPOTENCY_CONFLICT" },
};

/** Postgres error codes that are the caller's fault rather than ours. */
function statusFromPgCode(code) {
    if (DB_BUSINESS_ERRORS[code]) return DB_BUSINESS_ERRORS[code].status;
    if (code === "23505" || code === "P0001") return 409; // unique violation / raised business rule
    if (code === "22P02" || code === "22003") return 400; // invalid input syntax / out of range
    if (code === "P0002") return 404;
    return null;
}

/**
 * Status + client-safe message (+ optional code) for any thrown value. 5xx details are logged,
 * never returned, so database / driver messages do not leak to the browser.
 */
/** User-facing text for driver errors that are the caller's fault; the Postgres message itself never leaves the server. */
const PG_MESSAGES = {
    "23505": "This is already in use. Try a different value.",
    "22P02": "Some of the details are not valid. Check them and try again.",
    "22003": "A number is out of range. Check it and try again.",
    P0002: "We could not find what you asked for.",
};

export function toSafeError(error, context = "api") {
    const status = Number(error?.status) || statusFromPgCode(error?.code) || 500;
    const code = error?.errorCode || DB_BUSINESS_ERRORS[error?.code]?.code || undefined;

    if (status >= 500 && !error?.expose) {
        console.error(`[${context}]`, error);
        return { status, message: GENERIC_MESSAGE, code };
    }

    // A raw driver error (constraint names, column names, SQL) is logged, never returned. Messages
    // our own SQL functions raise for users (SQLSTATE CD***, P0001) and ApiError messages pass through.
    const pgCode = error instanceof ApiError ? null : error?.code;
    if (typeof pgCode === "string" && /^[0-9A-Z]{5}$/.test(pgCode) && !DB_BUSINESS_ERRORS[pgCode] && pgCode !== "P0001") {
        console.error(`[${context}]`, error);
        return { status, message: PG_MESSAGES[pgCode] || GENERIC_MESSAGE, code };
    }

    const extra = {};
    if (error?.retryAfter) extra.retryAfter = error.retryAfter;
    if (error instanceof ApiError && error.details) extra.details = error.details;
    return { status, message: error?.message || GENERIC_MESSAGE, code, ...extra };
}

/** Standard JSON error response for route handlers: `{ success: false, message, code? }`. */
export function errorResponse(error, context, headers) {
    const { status, message, code } = toSafeError(error, context);
    const extra = {};
    if (error?.retryAfter) extra["Retry-After"] = String(error.retryAfter);
    return NextResponse.json(
        { success: false, message, ...(code ? { code } : {}) },
        { status, headers: { "Cache-Control": "no-store", ...extra, ...(headers || {}) } }
    );
}
