'use client';

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/shadcn/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/shadcn/breadcrumb";
import { LogoMark } from "@/components/ui/logo";
import { AdminProvider } from "@/components/admin/adminContext";
import StepUpDialog from "@/components/admin/mfa/stepUpDialog";
import CommandPalette from "@/components/admin/shell/commandPalette";
import { useTheme } from "@/contexts/themeContext";
import { ADMIN_FOOTER_NAV, ADMIN_NAV, SETTINGS_SECTIONS, activeNavKey } from "@/lib/adminPermissions";
import { cn } from "@/lib/utils";
import { leaveSignedOut, LANDING_PATH } from "@/lib/authNavigation";
import { useLogOut } from "@/mutations/auth.mutation";
import { useApp } from "@/contexts/appContext";
import { useAdminTimeZoneStore } from "@/stores/adminTimeZoneStore";

import {
    LuActivity, LuArrowLeft, LuBookOpen, LuTags, LuClipboardList, LuKeyRound, LuLayoutDashboard, LuLoaderCircle,
    LuLogOut, LuMegaphone, LuMessageSquareText, LuMoon, LuPlay, LuReceipt, LuSearch, LuServer, LuSettings, LuSun, LuTarget, LuUsers,
} from "react-icons/lu";

const ICONS = {
    overview: LuLayoutDashboard, users: LuUsers, courses: LuBookOpen, catalog: LuTags, challenges: LuTarget, runs: LuPlay,
    access: LuKeyRound, orders: LuReceipt, feedback: LuMessageSquareText, announcements: LuMegaphone, audit: LuClipboardList,
    system: LuServer, settings: LuSettings,
};

// Highest role rank (lib/authz) to the name shown under the username.
const roleName = (rank) => (rank >= 100 ? "Super admin" : rank >= 80 ? "Admin" : rank >= 50 ? "Course manager" : rank >= 30 ? "Instructor" : "Staff");

// Quiet rows with muted icons; the open screen is the one violet-tinted row (its icon in the brand ink).
const NAV_BUTTON = "h-8 gap-2.5 px-2.5 text-muted-foreground hover:text-foreground [&>svg]:text-muted-foreground hover:[&>svg]:text-foreground data-[active=true]:bg-primary-soft data-[active=true]:text-primary-soft-foreground data-[active=true]:[&>svg]:text-primary-ink";

const ENVIRONMENTS = {
    production: { label: "Production", chip: "border-warning/30 bg-warning-soft text-warning", dot: "bg-warning" },
    staging: { label: "Staging", chip: "border-info/30 bg-info-soft text-info", dot: "bg-info" },
    development: { label: "Development", chip: "border-success/30 bg-success-soft text-success", dot: "bg-success" },
};

function NavItems({ items, activeKey }) {
    return (
        <SidebarMenu>
            {items.map((item) => {
                const Icon = ICONS[item.key] || LuActivity;
                const active = item.key === activeKey;
                return (
                    <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label} className={NAV_BUTTON}>
                            <Link href={item.href} aria-current={active ? "page" : undefined}>
                                <Icon aria-hidden="true" />
                                <span>{item.label}</span>
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                );
            })}
        </SidebarMenu>
    );
}

function Crumbs({ pathname }) {
    const segments = pathname.split("/").filter(Boolean).slice(1);
    const section = [...ADMIN_NAV, ...ADMIN_FOOTER_NAV].find((item) => item.href === `/admin/${segments[0]}`);

    return (
        <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
                <BreadcrumbItem className="shrink-0">
                    {segments.length === 0
                        ? <BreadcrumbPage>Overview</BreadcrumbPage>
                        : <BreadcrumbLink asChild><Link href="/admin">Admin</Link></BreadcrumbLink>}
                </BreadcrumbItem>
                {segments.map((segment, index) => {
                    const href = `/admin/${segments.slice(0, index + 1).join("/")}`;
                    const label = index === 0 ? section?.label || segment
                        : segments[0] === "settings" ? SETTINGS_SECTIONS.find((item) => item.key === segment)?.label || segment
                        : segment === "new" ? "New" : decodeURIComponent(segment);
                    const last = index === segments.length - 1;
                    return [
                        <BreadcrumbSeparator key={`s-${href}`} className="shrink-0" />,
                        <BreadcrumbItem key={href} className={last ? "min-w-0" : "shrink-0"}>
                            {last
                                ? <BreadcrumbPage className="truncate">{label}</BreadcrumbPage>
                                : <BreadcrumbLink asChild><Link href={href}>{label}</Link></BreadcrumbLink>}
                        </BreadcrumbItem>,
                    ];
                })}
            </BreadcrumbList>
        </Breadcrumb>
    );
}

/** The sidebar sections: Overview on its own, then one labelled group per `group` of ADMIN_NAV. */
function NavGroups({ items, activeKey }) {
    const groups = [];
    for (const item of items) {
        const last = groups[groups.length - 1];
        if (last && last.label === item.group) last.items.push(item);
        else groups.push({ label: item.group, items: [item] });
    }
    return groups.map((group) => (
        <SidebarGroup key={group.label || "main"} className="py-1">
            {group.label && <SidebarGroupLabel className="h-7 px-2.5 text-[11px] font-medium tracking-wide text-muted-foreground/80 uppercase">{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
                <NavItems items={group.items} activeKey={activeKey} />
            </SidebarGroupContent>
        </SidebarGroup>
    ));
}

/** The signed-in admin with their role, and a direct sign-out button (no menu: the row has one action). */
function Account({ username, rank }) {
    const queryClient = useQueryClient();
    const { showAlert: alert } = useApp();
    const logout = useLogOut();
    const signingOut = logout.isPending;
    const LogoutIcon = signingOut ? LuLoaderCircle : LuLogOut;

    const signOut = (event) => {
        event.preventDefault();
        if (signingOut) return;
        logout.mutate(null, {
            onSuccess: ({ revoked }) => leaveSignedOut(queryClient, {
                target: LANDING_PATH,
                notice: revoked ? null : {
                    status: 503,
                    message: "Signed out on this device, but the server could not be reached. Use Settings > Active sessions on another device to end this session remotely.",
                },
            }),
            onError: (error) => alert(error.status || 500, error.message || "Could not sign out, please try again."),
        });
    };

    return (
        <>
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink uppercase" aria-hidden="true">
                    {(username || "?").slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm font-medium">{username}</span>
                    <span className="block truncate text-xs text-muted-foreground">{roleName(rank)}</span>
                </span>
            </span>
            <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                title={signingOut ? "Signing out..." : "Log out"}
                aria-label={signingOut ? "Signing out" : "Log out"}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
            >
                <LogoutIcon className={cn("size-4", signingOut && "animate-spin")} aria-hidden="true" />
            </button>
        </>
    );
}

/**
 * Admin chrome (docs/admin-panel-plan.md 5.2): a sidebar on the page ground (⌘B / Ctrl B hides it),
 * a 48px top bar with the breadcrumb and the environment, and the content centred, up to 1280px wide.
 */
export default function AdminShell({ permissions, environment, user, children }) {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();
    const env = ENVIRONMENTS[environment] || ENVIRONMENTS.development;
    const granted = new Set(permissions);
    // An item may name several permissions: any one of them shows it.
    const visible = (items) => items.filter((item) => [].concat(item.permission).some((code) => granted.has(code)));
    const activeKey = activeNavKey(pathname);
    const [paletteOpen, setPaletteOpen] = useState(false);
    // The viewer's time zone is read after mount (the server renders UTC); dates re-render when it changes.
    const zone = useAdminTimeZoneStore((s) => s.zone);
    useEffect(() => useAdminTimeZoneStore.getState().hydrate(), []);

    return (
        <AdminProvider permissions={permissions} environment={environment}>
            <SidebarProvider className="admin-sidebar-theme h-dvh min-h-0 overflow-hidden">
                <a
                    href="#admin-main"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
                >
                    Skip to content
                </a>
                <Sidebar collapsible="offcanvas" role="navigation" aria-label="Admin navigation" className="border-r border-sidebar-border">
                    {/* 48px, level with the top bar, so the two borders meet in one line. */}
                    <SidebarHeader className="h-12 justify-center border-b border-sidebar-border px-3 py-0">
                        <Link href="/admin" className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                            <LogoMark size={22} />
                            <span>CodeDev</span>
                            <span className="rounded border border-border px-1.5 py-px text-[11px] font-medium text-muted-foreground">Admin</span>
                        </Link>
                    </SidebarHeader>
                    <SidebarContent className="gap-0 px-1 py-2">
                        <NavGroups items={visible(ADMIN_NAV)} activeKey={activeKey} />
                    </SidebarContent>
                    <SidebarFooter className="gap-2 border-t border-sidebar-border px-3 pt-2 pb-3">
                        <div className="-mx-1">
                            <NavItems items={visible(ADMIN_FOOTER_NAV)} activeKey={activeKey} />
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild className={NAV_BUTTON}>
                                        <Link href="/home">
                                            <LuArrowLeft aria-hidden="true" />
                                            <span>Back to CodeDev</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                            </SidebarMenu>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-background p-2">
                            <Account username={user?.username} rank={user?.rank} />
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                                aria-label={theme === "dark" ? "Use light theme" : "Use dark theme"}
                            >
                                {theme === "dark" ? <LuSun aria-hidden="true" /> : <LuMoon aria-hidden="true" />}
                            </button>
                        </div>
                    </SidebarFooter>
                </Sidebar>

                <SidebarInset className="min-h-0 min-w-0 overflow-hidden">
                    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-4">
                        <SidebarTrigger aria-label="Toggle navigation" className="-ml-1" />
                        <Crumbs pathname={pathname} />
                        <button
                            type="button"
                            onClick={() => setPaletteOpen(true)}
                            aria-label="Go to a screen or find a user"
                            aria-keyshortcuts="Control+K Meta+K"
                            className="ml-auto flex h-8 shrink-0 items-center gap-2 rounded-md border border-input px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none max-sm:w-8 max-sm:justify-center max-sm:px-0"
                        >
                            <LuSearch aria-hidden="true" className="size-4" />
                            <span className="max-sm:hidden">Search</span>
                            <kbd className="rounded border border-border bg-muted px-1 font-sans text-[11px] text-muted-foreground max-sm:hidden">Ctrl K</kbd>
                        </button>
                        <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold", env.chip)}>
                            <span aria-hidden="true" className={cn("size-1.5 rounded-full", env.dot)} />
                            {env.label}
                        </span>
                    </header>
                    {/* SidebarInset is already the page's <main>; this is the skip link's scroll target. */}
                    <div id="admin-main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
                        <div key={`${pathname}|${zone}`} data-admin-view className="@container mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">{children}</div>
                    </div>
                </SidebarInset>
            </SidebarProvider>
            <StepUpDialog />
            <CommandPalette permissions={permissions} open={paletteOpen} onOpenChange={setPaletteOpen} />
        </AdminProvider>
    );
}
