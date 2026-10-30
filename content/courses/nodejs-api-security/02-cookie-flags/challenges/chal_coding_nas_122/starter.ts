import { readFileSync } from "node:fs";

// CodeDev API (https://api.codedev.test): one place that writes every auth cookie.
//
// buildSetCookie(c) returns the Set-Cookie header value that stores the cookie.
// buildClearCookie(c) returns the Set-Cookie header value that deletes it (logout).
//
// Header format, attributes in exactly this order, separated by "; ":
//   <name>=<value>; Max-Age=<seconds>; Path=<path>[; Domain=<domain>][; Secure][; HttpOnly]; SameSite=<sameSite>
//   - Domain only when c.domain is set, Secure only when c.secure, HttpOnly only when c.httpOnly.
//   - buildClearCookie writes an empty value and Max-Age=0, and keeps every other attribute,
//     because the browser only deletes a cookie whose name, Path and Domain match.
//
// Before writing anything, validate the spec. Collect EVERY broken rule, in this order, and throw
// new CookieSpecError(codes) when the list is not empty:
//   INVALID_VALUE                 (set only) value has a character outside printable ASCII
//                                 0x21-0x7E, or a double quote, comma, semicolon or backslash
//   INVALID_MAX_AGE               (set only) maxAge is not an integer >= 1
//   INVALID_PATH                  path does not start with "/" or contains ";" or a space
//   SECURE_PREFIX_NEEDS_SECURE    name starts with "__Secure-" and secure is false
//   HOST_PREFIX_NEEDS_SECURE      name starts with "__Host-" and secure is false
//   HOST_PREFIX_NEEDS_ROOT_PATH   name starts with "__Host-" and path is not exactly "/"
//   HOST_PREFIX_FORBIDS_DOMAIN    name starts with "__Host-" and domain is set
//   SAMESITE_NONE_NEEDS_SECURE    sameSite is "None" and secure is false
//   TOKEN_COOKIE_NEEDS_HTTPONLY   purpose is "session" or "refresh" and httpOnly is false
//   CSRF_COOKIE_MUST_BE_READABLE  purpose is "csrf" and httpOnly is true
// The prefixes are matched case-insensitively ("__host-x" follows the "__Host-" rules).
// Do not change the types, CookieSpecError or the test runner.

type CookieSpec = {
    name: string;
    value: string;
    purpose: "session" | "refresh" | "csrf";
    maxAge: number;
    path: string;
    domain?: string;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "Strict" | "Lax" | "None";
};

class CookieSpecError extends Error {
    constructor(public codes: string[]) {
        super(codes.join(","));
    }
}

function buildSetCookie(c: CookieSpec): string {
    // TODO: validate the spec, then write every attribute in the order above
    return `${c.name}=${c.value}`;
}

function buildClearCookie(c: CookieSpec): string {
    // TODO: validate the spec, then write the deleting header
    return `${c.name}=`;
}

// ---------------------------------------------------------------- test runner (do not change)
type Step = { action: "set" | "clear"; cookie: CookieSpec };
const steps: Step[] = JSON.parse(readFileSync(0, "utf8"));
const results = steps.map((s) => {
    try {
        return { header: s.action === "set" ? buildSetCookie(s.cookie) : buildClearCookie(s.cookie) };
    } catch (e) {
        if (e instanceof CookieSpecError) return { errors: e.codes };
        return { crash: String(e) };
    }
});
console.log(JSON.stringify(results));
