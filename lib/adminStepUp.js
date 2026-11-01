/**
 * Bridge between the axios interceptor (lib/axios.js) and the admin step-up dialog: when an admin
 * API answers 403 REAUTH_REQUIRED / MFA_REQUIRED, the interceptor asks the dialog for a code and
 * replays the request once it is confirmed. Outside the admin area nothing is registered.
 */
let prompt = null;

export function registerStepUp(handler) {
    prompt = handler;
    return () => { if (prompt === handler) prompt = null; };
}

/** Resolves true once the admin confirmed with a code, false when they cancelled or nothing is registered. */
export function requestStepUp(code) {
    return prompt ? prompt(code) : Promise.resolve(false);
}
