'use client';
import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useLogOut } from "@/mutations/auth.mutation";
import { useApp } from "@/contexts/appContext";
import { useTheme } from "@/contexts/themeContext";
import { userQueries } from "@/queries/user.query";
import { leaveSignedOut, LANDING_PATH } from "@/lib/authNavigation";
import { useQueryParams } from "@/router/useQueryParams";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/shadcn/breadcrumb";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/shadcn/sheet";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { Separator } from "@/components/shadcn/separator";
import { SidebarTrigger } from "@/components/shadcn/sidebar";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { ExpProgress, levelProgress } from "@/components/ui/level";

import {
  LuChevronsUpDown,
  LuChevronRight,
  LuCircleHelp,
  LuCoins,
  LuLoaderCircle,
  LuLogIn,
  LuLogOut,
  LuMessageSquareText,
  LuMoon,
  LuReceipt,
  LuSettings,
  LuSun,
  LuTrophy,
  LuUser,
} from "react-icons/lu";

const SECTION_LABELS = {
  home: 'Home',
  learning: 'Learning',
  course: 'Courses',
  roadmap: 'Roadmap',
  blog: 'Blog',
  contact: 'Contacts',
  connect: 'Connect',
  about: 'About',
  help: 'Help',
  profile: 'Profile',
  settings: 'Settings',
};

// Account menu entries, shared by the desktop dropdown and the phone sheet.
// The theme switch is not here: the navbar shows its own toggle at every width.
const MENU_GROUPS = [
  {
    label: 'Your account',
    links: [
      { href: '/profile', label: 'Profile', icon: LuUser },
      { href: '/orders', label: 'Orders and points', icon: LuReceipt },
      { href: '/settings', label: 'Settings', icon: LuSettings },
    ],
  },
  {
    label: 'Support',
    links: [{ href: '/help', label: 'Help center', icon: LuCircleHelp }],
    feedback: true,
  },
];

export function formatPoints(value) {
  const points = Number(value || 0);
  return points > 999 ? `${(points / 1000).toFixed(1)}k` : String(points);
}

function initials(name = '') {
  const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function PageBreadcrumb() {
  const pathname = usePathname() || '/';
  const segments = pathname.split('/').filter(Boolean);
  const section = segments[0] || 'home';
  const label = SECTION_LABELS[section] || section.charAt(0).toUpperCase() + section.slice(1);

  const crumbs = segments.length > 1
    ? [{ label, href: `/${section}` }, { label: 'Details' }]
    : [{ label }];

  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {crumbs.map((crumb, index) => (
          <Fragment key={crumb.label + index}>
            {index > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem className="min-w-0">
              {crumb.href ? (
                <BreadcrumbLink asChild>
                  <Link href={crumb.href}>{crumb.label}</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage className="truncate font-medium">{crumb.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function AccountMenu() {
  const { showAlert: alert } = useApp();
  const { status } = useSession();
  const updateQuery = useQueryParams();
  const queryClient = useQueryClient();
  const logoutMutation = useLogOut();

  const { data, isLoading, error, isError } = useQuery(userQueries.me(status));

  useEffect(() => {
    if (!isError) return;
    alert(error?.status || 500, error?.message || 'Failed to load data, try again.');
  }, [isError]);

  const handleLogout = (event) => {
    event.preventDefault();
    if (logoutMutation.isPending) return;

    logoutMutation.mutate(null, {
      onSuccess: ({ revoked }) => {
        // Full page load to the landing page: drops React Query, the router cache (which still
        // holds /home and the signed-in `/` redirect) and this history entry.
        leaveSignedOut(queryClient, {
          target: LANDING_PATH,
          notice: revoked ? null : {
            status: 503,
            message: 'Signed out on this device, but the server could not be reached. Use Settings > Active sessions on another device to end this session remotely.',
          },
        });
      },
      onError: (error) => {
        alert(error.status || 500, error.message || 'Could not sign out, please try again.');
      }
    });
  };

  const name = data?.username || data?.email || 'Account';
  const points = formatPoints(data?.points);
  const progress = levelProgress(data);
  const isMobile = useIsMobile();
  const pathname = usePathname() || '/';
  const [sheetOpen, setSheetOpen] = useState(false);
  const isCurrent = (href) => pathname === href || pathname.startsWith(`${href}/`);
  const signingOut = logoutMutation.isPending;

  const triggerButton = (
    <Button
      variant="ghost"
      className="h-9 gap-2 px-1.5 sm:px-2 data-[state=open]:bg-accent"
    >
      {/* No aria-label: the accessible name must contain the visible text (WCAG 2.5.3),
          so the name, level and points are read as shown, then "Account menu". */}
      <Avatar className="size-7 rounded-md">
        <AvatarImage src={data?.image || undefined} alt="" />
        <AvatarFallback className="rounded-md bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="sr-only sm:hidden">{name}</span>
      <span className="hidden max-w-[10rem] flex-col items-start gap-0.5 leading-tight sm:flex">
        {isLoading ? (
          // Level and points are unknown until /me answers: no placeholder "Lv 1 · 0 pts".
          <>
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3 w-14" />
          </>
        ) : (
          <>
            <span className="max-w-full truncate text-[13px] font-medium">{name}</span>
            <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground tabular">
              <span className="font-semibold text-xp">Lv {Number(data?.level) || 1}</span>
              <span aria-hidden="true">·</span>
              <LuCoins className="size-3 text-warning" aria-hidden="true" />
              {points} pts
            </span>
          </>
        )}
      </span>
      <LuChevronsUpDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden="true" />
      <span className="sr-only">Account menu</span>
    </Button>
  );

  // Who is signed in, level progress and the points balance (links to the wallet).
  const summary = (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-10 rounded-full border border-border/60 shadow-xs">
          <AvatarImage src={data?.image || undefined} alt="" />
          <AvatarFallback className="rounded-full bg-primary-soft text-sm font-semibold text-primary-soft-foreground">
            {initials(name)}
          </AvatarFallback>
        </Avatar>
        <span className="grid min-w-0 flex-1 leading-tight">
          <span className="truncate text-sm font-semibold text-foreground">{data?.username || data?.name || '-'}</span>
          <span className="truncate text-xs text-muted-foreground">{data?.email || '-'}</span>
        </span>
      </div>

      <div className="rounded-xl border border-border/50 bg-muted/40 p-2.5 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-xp">
            <LuTrophy className="size-3.5 shrink-0" aria-hidden="true" />
            Lv {progress.level}
            {progress.title && (
              <span className="max-w-[90px] truncate font-sans text-xs font-normal text-muted-foreground">
                · {progress.title}
              </span>
            )}
          </span>
          <Link
            href="/orders"
            className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-warning hover:underline"
          >
            <LuCoins className="size-3.5 shrink-0" aria-hidden="true" />
            {points} pts
          </Link>
        </div>

        <div
          role="progressbar"
          aria-label={`Level ${progress.level}: ${progress.percent}% progress`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          className="my-2 h-1.5 w-full overflow-hidden rounded-full bg-xp-soft"
        >
          <div
            className="h-full rounded-full bg-xp transition-all duration-500 motion-reduce:transition-none"
            style={{ width: `${progress.percent}%` }}
          />
        </div>

        <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{progress.exp.toLocaleString()} EXP</span>
          <span>
            {progress.isMax ? "Max level" : `${progress.toNext.toLocaleString()} to Lv ${progress.nextLevel}`}
          </span>
        </div>
      </div>
    </div>
  );

  const openFeedback = () => updateQuery({ modal: 'feedback' });
  const logoutLabel = signingOut ? 'Signing out...' : 'Log out';
  const LogoutIcon = signingOut ? LuLoaderCircle : LuLogOut;

  if (isMobile) {
    const row = "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-foreground transition-colors hover:bg-muted active:bg-accent aria-[current=page]:bg-primary-soft aria-[current=page]:text-primary-soft-foreground [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground aria-[current=page]:[&>svg]:text-primary-soft-foreground";
    const close = () => setSheetOpen(false);

    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          {triggerButton}
        </SheetTrigger>

        <SheetContent side="bottom" showCloseButton={false} className="flex max-h-[85dvh] flex-col gap-0 rounded-t-2xl border-t bg-background p-0">
          <div className="mx-auto my-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <SheetHeader className="sr-only">
            <SheetTitle>Account menu</SheetTitle>
            <SheetDescription>Profile, orders, settings and help</SheetDescription>
          </SheetHeader>

          <div className="border-b px-4 pb-4">{summary}</div>

          <nav aria-label="Account" className="min-h-0 flex-1 overflow-y-auto p-2">
            {MENU_GROUPS.map((group, index) => (
              <Fragment key={group.label}>
                {index > 0 && <Separator className="my-1.5" />}
                <ul className="list-none" aria-label={group.label}>
                  {group.links.map(({ href, label, icon: Icon }) => (
                    <li key={href}>
                      <Link href={href} onClick={close} className={row} aria-current={isCurrent(href) ? 'page' : undefined}>
                        <Icon aria-hidden="true" />
                        {label}
                      </Link>
                    </li>
                  ))}
                  {group.feedback && (
                    <li>
                      <button type="button" className={row} onClick={() => { close(); openFeedback(); }}>
                        <LuMessageSquareText aria-hidden="true" />
                        Send feedback
                      </button>
                    </li>
                  )}
                </ul>
              </Fragment>
            ))}
          </nav>

          <div className="border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {/* Signing out is undone by signing in again: an outline button, no confirm step. */}
            <Button
              variant="outline"
              className="h-11 w-full text-destructive hover:bg-destructive-soft hover:text-destructive"
              onClick={(event) => {
                close();
                handleLogout(event);
              }}
              disabled={signingOut}
            >
              <LogoutIcon className={signingOut ? 'animate-spin' : undefined} aria-hidden="true" />
              {logoutLabel}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {triggerButton}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72 sm:w-80 p-1.5 shadow-lg rounded-xl border-border/80">
        <DropdownMenuLabel className="p-2 font-normal">{summary}</DropdownMenuLabel>
        {MENU_GROUPS.map((group) => (
          <Fragment key={group.label}>
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuGroup aria-label={group.label}>
              {group.links.map(({ href, label, icon: Icon }) => (
                <DropdownMenuItem key={href} asChild className="rounded-lg px-2.5 py-2 text-sm cursor-pointer">
                  <Link
                    href={href}
                    aria-current={isCurrent(href) ? 'page' : undefined}
                    className="aria-[current=page]:bg-accent aria-[current=page]:font-medium"
                  >
                    <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span>{label}</span>
                  </Link>
                </DropdownMenuItem>
              ))}
              {group.feedback && (
                <DropdownMenuItem onSelect={openFeedback} className="rounded-lg px-2.5 py-2 text-sm cursor-pointer">
                  <LuMessageSquareText className="size-4 text-muted-foreground" aria-hidden="true" />
                  <span>Send feedback</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuGroup>
          </Fragment>
        ))}
        <DropdownMenuSeparator className="my-1" />
        <DropdownMenuItem
          variant="destructive"
          onSelect={handleLogout}
          disabled={signingOut}
          className="rounded-lg px-2.5 py-2 text-sm cursor-pointer"
        >
          <LogoutIcon className={cn("size-4", signingOut ? 'animate-spin' : undefined)} aria-hidden="true" />
          <span>{logoutLabel}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="size-8 text-muted-foreground hover:text-foreground"
        >
          {isDark ? <LuSun className="size-4 text-warning" /> : <LuMoon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {isDark ? "Switch to light mode" : "Switch to dark mode"}
      </TooltipContent>
    </Tooltip>
  );
}

export default function Navbar() {
  const { status } = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-12 w-full shrink-0 items-center gap-2 border-b border-border/80 bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/80 sm:px-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger className="-ml-1 size-8 text-muted-foreground hover:text-foreground" />
        </TooltipTrigger>
        <TooltipContent side="bottom" className="flex items-center gap-2">
          Toggle sidebar
          <KbdGroup><Kbd>Ctrl</Kbd><Kbd>B</Kbd></KbdGroup>
        </TooltipContent>
      </Tooltip>
      <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
      <PageBreadcrumb />

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <ThemeToggle />
        {status === 'loading' && <Skeleton className="h-8 w-32" />}
        {status === 'authenticated' && <AccountMenu />}
        {status === 'unauthenticated' && (
          <Button asChild size="sm">
            <Link href="/auth"><LuLogIn />Sign in</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
