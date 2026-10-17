/**
 * Structured audit log for authentication events. One JSON line per event on stdout.
 *
 * Only identifiers go in here: never tokens, cookies, passwords or idempotency keys.
 */
const ALLOWED_FIELDS = ["userId", "sessionId", "ip", "reason", "status", "provider", "count", "outboxId"];

export function auditAuth(event, fields = {}) {
    const entry = { type: "auth_audit", event, at: new Date().toISOString() };

    for (const key of ALLOWED_FIELDS) {
        if (fields[key] !== undefined && fields[key] !== null) entry[key] = fields[key];
    }

    const line = JSON.stringify(entry);
    if (event.endsWith(".failed") || event.endsWith(".reuse_detected")) console.warn(line);
    else console.info(line);
}

export default auditAuth;
