import { NextResponse } from "next/server";

export class ApiError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
    }
}

const GENERIC_MESSAGE = "Something went wrong, please try again.";

/** Postgres error codes that are the caller's fault rather than ours. */
function statusFromPgCode(code) {
    if (code === "23505" || code === "P0001") return 409; // unique violation / raised business rule
    if (code === "22P02" || code === "22003") return 400; // invalid input syntax / out of range
    if (code === "P0002") return 404;
    return null;
}

/**
 * Status + client-safe message for any thrown value. 5xx details are logged, never returned,
 * so database / driver messages do not leak to the browser.
 */
export function toSafeError(error, context = "api") {
    const status = Number(error?.status) || statusFromPgCode(error?.code) || 500;

    if (status >= 500) {
        console.error(`[${context}]`, error);
        return { status, message: GENERIC_MESSAGE };
    }

    return { status, message: error?.message || GENERIC_MESSAGE };
}

/** Standard JSON error response for route handlers: `{ success: false, message }`. */
export function errorResponse(error, context, headers) {
    const { status, message } = toSafeError(error, context);
    return NextResponse.json({ success: false, message }, { status, headers });
}
