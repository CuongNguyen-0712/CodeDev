// Outcomes of a refresh-token rotation (db/session.db.js -> rotateRefreshToken).
export const TOKEN = {
    REFRESH: "REFRESH",            // rotated: new token issued
    RECOVERED: "RECOVERED",        // idempotent retry: the token issued by the original rotation
    INVALID: "INVALID",            // unknown token
    REVOKED: "REVOKED",            // session or token revoked
    EXPIRED: "EXPIRED",            // session idle/absolute expiry or token expiry passed
    REUSED: "REUSED",              // consumed token replayed: session revoked
    SESSION_MISMATCH: "SESSION_MISMATCH", // refresh cookie belongs to another session than the session JWT
};

// Machine-readable `code` of auth error responses ({ success: false, message, code }).
export const AUTH_ERROR = {
    UNAUTHENTICATED: "UNAUTHENTICATED",            // 401: no session
    ACCESS_TOKEN_EXPIRED: "ACCESS_TOKEN_EXPIRED",  // 401: refresh, then retry once
    REFRESH_TOKEN_MISSING: "REFRESH_TOKEN_MISSING",// 401
    REFRESH_TOKEN_INVALID: "REFRESH_TOKEN_INVALID",// 401
    REFRESH_TOKEN_EXPIRED: "REFRESH_TOKEN_EXPIRED",// 401
    REFRESH_TOKEN_REUSED: "REFRESH_TOKEN_REUSED",  // 401: session revoked
    SESSION_REVOKED: "SESSION_REVOKED",            // 401
    SESSION_MISMATCH: "SESSION_MISMATCH",          // 401
    IDEMPOTENCY_KEY_REQUIRED: "IDEMPOTENCY_KEY_REQUIRED", // 400
    ORIGIN_REJECTED: "ORIGIN_REJECTED",            // 403
    AUTH_UNAVAILABLE: "AUTH_UNAVAILABLE",          // 503: neither Redis nor PostgreSQL can verify
};

// Refresh failures after which the client must sign in again.
export const TERMINAL_REFRESH_ERRORS = [
    AUTH_ERROR.UNAUTHENTICATED,
    AUTH_ERROR.REFRESH_TOKEN_MISSING,
    AUTH_ERROR.REFRESH_TOKEN_INVALID,
    AUTH_ERROR.REFRESH_TOKEN_EXPIRED,
    AUTH_ERROR.REFRESH_TOKEN_REUSED,
    AUTH_ERROR.SESSION_REVOKED,
    AUTH_ERROR.SESSION_MISMATCH,
];

// `token.error` values that end a session for good (the client must sign in again).
export const SESSION_ERROR = {
    INVALID: "SessionInvalid",
    EXPIRED: "SessionExpired",
    REVOKED: "SessionRevoked",
};

export const FATAL_SESSION_ERRORS = Object.values(SESSION_ERROR);

export const isFatalSessionError = (error) => FATAL_SESSION_ERRORS.includes(error);
