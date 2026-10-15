export const TOKEN = {
    REFRESH: "REFRESH",
    CONCURRENT: "CONCURRENT",
    INVALID: "INVALID",
    REVOKED: "REVOKED",
    EXPIRED: "EXPIRED",
    FAILED: "FAILED",
};

// `token.error` values that end a session for good (the client must sign in again).
export const SESSION_ERROR = {
    INVALID: "SessionInvalid",
    EXPIRED: "SessionExpired",
    REVOKED: "SessionRevoked",
};

export const FATAL_SESSION_ERRORS = Object.values(SESSION_ERROR);

export const isFatalSessionError = (error) => FATAL_SESSION_ERRORS.includes(error);
