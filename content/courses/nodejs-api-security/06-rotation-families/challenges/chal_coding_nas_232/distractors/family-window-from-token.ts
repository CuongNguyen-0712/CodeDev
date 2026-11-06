// @piece family-window: Family lifetime, then idle timeout
const now = deps.now();
const familyStart = row.createdAt;
const familyExpiresAt = familyStart + deps.absoluteLifetimeMs;
if (now >= familyExpiresAt) return { ok: false, reason: "family_expired" };
if (now >= row.expiresAt) return { ok: false, reason: "idle_timeout" };
