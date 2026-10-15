/**
 * Tab-local flag raised while this tab is signing itself out, so the realtime
 * `session-revoked` echo of our own logout is not treated as a remote revocation.
 */
let signingOut = false;

export function markSigningOut(value = true) {
    signingOut = value;
}

export function isSigningOut() {
    return signingOut;
}
