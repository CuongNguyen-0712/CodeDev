'use client';

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
    Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarInset,
    SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
} from "@/components/shadcn/sidebar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/shadcn/breadcrumb";
import { LogoMark } from "@/components/ui/logo";
import { AdminProvider } from "@/components/admin/adminContext";
import { useTheme } from "@/contexts/themeContext";
import { ADMIN_FOOTER_NAV, ADMIN_NAV, activeNavKey } from "@/lib/adminPermissions";
import { cn } from "@/lib/utils";

import {
    LuActivity, LuArrowLeft, LuBookOpen, LuTags, LuClipboardList, LuKeyRound, LuLayoutDashboard, LuMoon, LuPlay,
    LuReceipt, LuServer, LuSettings, LuSun, LuTarget, LuUsers,
} from "react-icons/lu";

const ICONS = {
    overview: LuLayoutDashboard, users: LuUsers, courses: LuBookOpen, catalog: LuTags, challenges: LuTarget, runs: LuPlay,
    access: LuKeyRound, orders: LuReceipt, audit: LuClipboardList, system: LuServer, settings: LuSettings,
};

const ENVIRONMENTS = {
    production: { label: "Production", chip: "bg-warning-soft text-warning", stripe: "bg-warning" },
    staging: { label: "Staging", chip: "bg-info-soft text-info", stripe: "bg-info" },
    development: { label: "Development", chip: "bg-muted text-muted-foreground", stripe: null },
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
                <BreadcrumbItem>
                    {segments.length === 0
                        ? <BreadcrumbPage>Overview</BreadcrumbPage>
                        : <BreadcrumbLink asChild><Link href="/admin">Admin</Link></BreadcrumbLink>}
                </BreadcrumbItem>
                {segments.map((segment, index) => {
                    const href = `/admin/${segments.slice(0, index + 1).join("/")}`;
                    const label = index === 0 ? section?.label || segment : decodeURIComponent(segment);
                    const last = index === segments.length - 1;
                    return [
                        <BreadcrumbSeparator key={`s-${href}`} />,
                        <BreadcrumbItem key={href} className="min-w-0">
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

/**
 * Admin chrome (docs/admin-panel-plan.md 5.2): a sidebar on the page ground (⌘B / Ctrl B hides it),
 * a 48px top bar with the breadcrumb and the environment, and the content up to 1200px wide.
 */
export default function AdminShell({ permissions, environment, user, children }) {
    const pathname = usePathname();
    const { theme, toggleTheme } = useTheme();
    const env = ENVIRONMENTS[environment] || ENVIRONMENTS.development;
    const granted = new Set(permissions);
    const visible = (items) => items.filter((item) => granted.has(item.permission));
    const activeKey = activeNavKey(pathname);

    return (
        <AdminProvider permissions={permissions} environment={environment}>
            {env.stripe && <div aria-hidden="true" className={cn("fixed inset-x-0 top-0 z-50 h-1", env.stripe)} />}
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
                        <div className="mt-1 flex items-center gap-2 rounded-md px-2 py-1.5">
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase" aria-hidden="true">
                                {(user?.username || "?").slice(0, 1)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-sm">{user?.username}</span>
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
                        <span className={cn("ml-auto shrink-0 rounded px-2 py-0.5 text-xs font-medium", env.chip)}>
                            {env.label}
                        </span>
                    </header>
                    <main id="admin-main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto outline-none">
                        <div className="mx-0 w-full max-w-[1200px] px-4 py-6 md:px-6">{children}</div>
                    </main>
                </SidebarInset>
            </SidebarProvider>
        </AdminProvider>
    );
}
