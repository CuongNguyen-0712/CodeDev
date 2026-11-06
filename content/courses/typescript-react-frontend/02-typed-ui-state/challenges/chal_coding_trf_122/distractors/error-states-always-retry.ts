// @piece error-states: Failed: retry, sign in again, or explain
const error = snapshot.error;
if (error && error.status === 401) return { kind: "error", message: "Your session has expired. Sign in again.", canRetry: false };
return { kind: "error", message: RETRY_MESSAGE, canRetry: true };
