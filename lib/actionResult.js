/**
 * Client side of `runAction`: turns `{ success: false, status, message }` back into a thrown
 * Error (with `.status`) so React Query `onError` handlers keep working.
 */
export function unwrapActionResult(result) {
    if (!result?.success) {
        const error = new Error(result?.message || "Request failed, please try again.");
        error.status = result?.status || 500;
        if (result?.retryAfter) error.retryAfter = result.retryAfter;
        throw error;
    }
    return result.data;
}
