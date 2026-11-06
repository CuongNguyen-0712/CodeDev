// @piece error-states: Failed: retry, sign in again, or explain
const error = snapshot.error as ApiError;
if (error.status === 401) return { kind: "error", message: "Your session has expired. Sign in again.", canRetry: false };
if (isRetryable(error.status)) return { kind: "error", message: RETRY_MESSAGE, canRetry: true };
return { kind: "error", message: error.message, canRetry: false };
