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

const ipv4ToInt = (ip) => {
    const parts = String(ip).split(".");
    if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return null;
    return parts.reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
};

/**
 * Optional ADMIN_IP_ALLOWLIST: comma-separated IPv4 addresses or CIDR ranges ("203.0.113.0/24")
 * and exact IPv6 addresses. Unset or empty: every address is allowed. An unknown client address
 * is refused when a list is set (fail closed).
 */
export function adminIpAllowed(ip, env = process.env) {
    const entries = String(env.ADMIN_IP_ALLOWLIST || "").split(",").map((entry) => entry.trim()).filter(Boolean);
    if (entries.length === 0) return true;
    const address = String(ip || "").trim().replace(/^::ffff:/, "");
    const value = ipv4ToInt(address);
    return entries.some((entry) => {
        const [base, bits] = entry.split("/");
        if (bits === undefined) return base.toLowerCase() === address.toLowerCase();
        const baseValue = ipv4ToInt(base);
        const size = Number(bits);
        if (value == null || baseValue == null || !Number.isInteger(size) || size < 0 || size > 32) return false;
        const mask = size === 0 ? 0 : (0xffffffff << (32 - size)) >>> 0;
        return (value & mask) === (baseValue & mask);
    });
}
