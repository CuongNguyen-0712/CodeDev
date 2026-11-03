'use client';

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
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

import {
    LuActivity, LuArrowLeft, LuBookOpen, LuTags, LuClipboardList, LuKeyRound, LuLayoutDashboard, LuLoaderCircle,
    LuLogOut, LuMessageSquareText, LuMoon, LuPlay, LuReceipt, LuSearch, LuServer, LuSettings, LuSun, LuTarget, LuUsers,
} from "react-icons/lu";

const ICONS = {
    overview: LuLayoutDashboard, users: LuUsers, courses: LuBookOpen, catalog: LuTags, challenges: LuTarget, runs: LuPlay,
    access: LuKeyRound, orders: LuReceipt, feedback: LuMessageSquareText, audit: LuClipboardList, system: LuServer, settings: LuSettings,
};

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
                        <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
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
                        : decodeURIComponent(segment);
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

/** The signed-in admin and a direct sign-out button (no menu: the row has only one action). */
function Account({ username }) {
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
            <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase" aria-hidden="true">
                    {(username || "?").slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{username}</span>
            </span>
            <button
                type="button"
                onClick={signOut}
                disabled={signingOut}
                title={signingOut ? "Signing out..." : "Log out"}
                aria-label={signingOut ? "Signing out" : "Log out"}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-destructive hover:bg-destructive-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
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
    const visible = (items) => items.filter((item) => granted.has(item.permission));
    const activeKey = activeNavKey(pathname);
    const [paletteOpen, setPaletteOpen] = useState(false);

    return (
        <AdminProvider permissions={permissions} environment={environment}>
            <SidebarProvider className="h-dvh min-h-0 overflow-hidden">
                <a
                    href="#admin-main"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:ring-2 focus:ring-ring"
                >
                    Skip to content
                </a>
                <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
                    <SidebarHeader className="px-3 pt-4">
                        <Link href="/admin" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-semibold">
                            <LogoMark size={22} />
                            <span>CodeDev Admin</span>
                        </Link>
                    </SidebarHeader>
                    <SidebarContent>
                        <SidebarGroup>
                            <SidebarGroupContent>
                                <NavItems items={visible(ADMIN_NAV)} activeKey={activeKey} />
                            </SidebarGroupContent>
                        </SidebarGroup>
                    </SidebarContent>
                    <SidebarFooter className="gap-1 px-2 pb-3">
                        <NavItems items={visible(ADMIN_FOOTER_NAV)} activeKey={activeKey} />
                        <SidebarMenu>
                            <SidebarMenuItem>
                                <SidebarMenuButton asChild>
                                    <Link href="/home">
                                        <LuArrowLeft aria-hidden="true" />
                                        <span>Back to CodeDev</span>
                                    </Link>
                                </SidebarMenuButton>
                            </SidebarMenuItem>
                        </SidebarMenu>
                        <div className="mt-1 flex items-center gap-1">
                            <Account username={user?.username} />
                            <button
                                type="button"
                                onClick={toggleTheme}
                                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
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
                    <main id="admin-main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
                        <div key={pathname} data-admin-view className="@container mx-auto w-full max-w-[1280px] px-4 py-6 md:px-6">{children}</div>
                    </main>
                </SidebarInset>
            </SidebarProvider>
            <StepUpDialog />
            <CommandPalette permissions={permissions} open={paletteOpen} onOpenChange={setPaletteOpen} />
        </AdminProvider>
    );
}
