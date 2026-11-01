/**
 * Kill switch for the admin area (docs/admin-panel-plan.md 2.1): ADMIN_ENABLED=0 makes /admin*,
 * /api/admin/* and /studio* answer 404 in this environment without a code change. On by default.
 * Checked by proxy.js, the admin layout, the studio page and requirePermission (lib/authz.js).
 */
export const adminEnabled = (env = process.env) =>
    !["0", "false", "off"].includes(String(env.ADMIN_ENABLED ?? "").trim().toLowerCase());

const ADMIN_PREFIXES = ["/admin", "/studio", "/api/admin"];

export const isAdminPath = (pathname) =>
    ADMIN_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
