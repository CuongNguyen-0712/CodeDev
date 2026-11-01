import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Admin access (docs/admin-panel-plan.md 3.6, finding A1): every admin API handler asks for
 * `admin.read`, and the default learner role holds no course / blog write permission.
 */
const ADMIN_API = path.resolve("app/api/admin");

function routeFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return routeFiles(full);
        return entry.name === "route.js" ? [full] : [];
    });
}

describe("admin API routes", () => {
    const files = routeFiles(ADMIN_API);

    it("finds the admin routes", () => {
        expect(files.length).toBeGreaterThan(10);
    });

    it.each(files.map((file) => [path.relative(ADMIN_API, file), file]))("%s: every handler requires admin.read", (_name, file) => {
        const source = readFileSync(file, "utf8");
        const handlers = source.match(/export const (GET|POST|PUT|PATCH|DELETE)\b/g) || [];
        const checks = source.match(/requirePermission\(userId, (\[\s*)?"admin\.read"/g) || [];

        expect(handlers.length).toBeGreaterThan(0);
        expect(checks.length).toBe(handlers.length);
    });
});

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("learner role permissions (PostgreSQL)", () => {
    it("the default role has no course or blog write permission", async () => {
        const { sql } = await import("@/lib/db");
        const { rows } = await sql(
            `SELECT p.resource || '.' || p.action AS permission
             FROM identity.role_permissions rp
             JOIN identity.permissions p ON p.id = rp.permission_id
             WHERE rp.role_id = public.default_role_id()
               AND p.resource IN ('course', 'blog')
               AND p.action IN ('create', 'update', 'delete')`
        );
        expect(rows).toEqual([]);
    });
});

describe("admin kill switch and navigation", () => {
    it("ADMIN_ENABLED=0 / false / off turns the admin area off; anything else keeps it on", async () => {
        const { adminEnabled, isAdminPath } = await import("@/lib/adminMode");
        for (const value of ["0", "false", "off", " OFF "]) expect(adminEnabled({ ADMIN_ENABLED: value })).toBe(false);
        for (const value of [undefined, "", "1", "true"]) expect(adminEnabled({ ADMIN_ENABLED: value })).toBe(true);
        expect(isAdminPath("/admin")).toBe(true);
        expect(isAdminPath("/admin/users/abc")).toBe(true);
        expect(isAdminPath("/studio/desk")).toBe(true);
        expect(isAdminPath("/administrator")).toBe(false);
    });

    it("marks the longest matching nav item active", async () => {
        const { activeNavKey } = await import("@/lib/adminPermissions");
        expect(activeNavKey("/admin")).toBe("overview");
        expect(activeNavKey("/admin/users/01ABC")).toBe("users");
        expect(activeNavKey("/admin/settings/roles")).toBe("settings");
        expect(activeNavKey("/home")).toBe(null);
    });
});
