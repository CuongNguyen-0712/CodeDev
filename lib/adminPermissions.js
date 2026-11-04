/**
 * The admin navigation and the permission each screen needs (docs/admin-panel-plan.md 3.3).
 * Used by the sidebar (hides what the viewer cannot open) and by each page's server check.
 * Hiding is never the security boundary: every API checks its permissions again.
 */
export const ADMIN_NAV = [
    { key: "overview", href: "/admin", label: "Overview", permission: "admin.read" },
    { key: "users", href: "/admin/users", label: "Users", permission: "user.read" },
    { key: "courses", href: "/admin/courses", label: "Courses", permission: "admin.read" },
    { key: "catalog", href: "/admin/catalog", label: "Catalog", permission: "admin.read" },
    { key: "challenges", href: "/admin/challenges", label: "Challenges", permission: "admin.read" },
    { key: "runs", href: "/admin/runs", label: "Runs", permission: "submission.read" },
    { key: "access", href: "/admin/access", label: "Access", permission: "entitlement.grant" },
    { key: "orders", href: "/admin/orders", label: "Orders", permission: "order.list" },
    // Either permission opens the page (app/admin/feedback); each section checks its own.
    { key: "feedback", href: "/admin/feedback", label: "Feedback", permission: ["feedback.read", "comment.moderate"] },
    { key: "announcements", href: "/admin/announcements", label: "Announcements", permission: "announcement.send" },
    { key: "audit", href: "/admin/audit", label: "Audit", permission: "audit.read" },
    { key: "system", href: "/admin/system", label: "System", permission: "ops.read" },
];

export const ADMIN_FOOTER_NAV = [
    { key: "settings", href: "/admin/settings", label: "Settings", permission: "platform.settings" },
];

/** The nav item a pathname belongs to (longest matching href), for the active state. */
export function activeNavKey(pathname) {
    const items = [...ADMIN_NAV, ...ADMIN_FOOTER_NAV]
        .filter((item) => pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`)))
        .sort((a, b) => b.href.length - a.href.length);
    return items[0]?.key ?? null;
}

/** Settings screens (docs/admin-panel-plan.md 06), one route each under /admin/settings. */
export const SETTINGS_SECTIONS = [
    { key: "general", label: "General" },
    { key: "roles", label: "Roles & permissions" },
    { key: "storage", label: "Storage" },
    { key: "mail", label: "Mail" },
    { key: "limits", label: "Limits" },
    { key: "observability", label: "Observability" },
];
