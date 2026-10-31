// What a learner reads when something fails. Technical text (network stack, framework, database)
// is never shown in the browser: the server already logged the details (lib/error/apiError.js).

export const NETWORK_MESSAGE = "We couldn't reach CodeDev. Check your connection and try again.";
export const TIMEOUT_MESSAGE = "That took too long. Please try again.";
export const GENERIC_MESSAGE = "Something went wrong. Please try again.";

const NETWORK = /network ?error|failed to fetch|fetch failed|load failed|err_network|econnrefused|econnreset|enotfound/i;
const TIMEOUT = /timeout of \d+ms|timed? ?out|etimedout/i;
const TECHNICAL = new RegExp([
    "request failed with status code",
    "unexpected token", "is not valid json", "json\\.parse",
    "typeerror", "syntaxerror", "referenceerror", "rangeerror",
    "cannot read propert", "is not a function", "is not defined",
    "duplicate key", "violates", "constraint \"", "relation \"", "column \"", "syntax error at", "sqlstate",
    "server components render", "unexpected response was received", "internal server error",
    "digest:", "stack:", "at [\\w$.]+ \\(",
].join("|"), "i");

/** A sentence a learner can act on, from an Error, a server message or a string. */
export function userMessage(input, fallback = GENERIC_MESSAGE) {
    const message = typeof input === "string" ? input : input?.message;
    if (typeof message !== "string" || !message.trim()) return fallback;
    if (NETWORK.test(message)) return NETWORK_MESSAGE;
    if (TIMEOUT.test(message)) return TIMEOUT_MESSAGE;
    if (TECHNICAL.test(message)) return fallback;
    return message;
}

/** The same error with a user-safe message; status, code and data are kept for the handlers. */
export function toUserError(error, fallback) {
    const safe = new Error(userMessage(error, fallback));
    for (const key of ["status", "code", "data", "response", "retryAfter", "details"]) {
        if (error?.[key] !== undefined) safe[key] = error[key];
    }
    return safe;
}

/** Logs only in development (as a warning, so the Next.js error overlay stays for real errors); production browsers keep a clean console, the server keeps the logs. */
export function devLog(...args) {
    if (process.env.NODE_ENV !== "production") console.warn(...args);
}
