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
import { useRouterActions } from "@/router/useRouterActions";
import { useQueryParams } from "@/router/useQueryParams";
import { useIsMobile } from "@/hooks/use-mobile";

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

import {
  LuChevronsUpDown,
  LuCircleHelp,
  LuCoins,
  LuLoaderCircle,
  LuLogIn,
  LuLogOut,
  LuMessageSquareText,
  LuMoon,
  LuSettings,
  LuSun,
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
  const { navigateReplace } = useRouterActions();
  const updateQuery = useQueryParams();
  const queryClient = useQueryClient();
  const logoutMutation = useLogOut();

  const { data, isLoading, error, isError } = useQuery(userQueries.me(status));
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    if (!isError) return;
    alert(error?.status || 500, error?.message || 'Failed to load data, try again.');
  }, [isError]);

  const handleLogout = (event) => {
    event.preventDefault();
    if (logoutMutation.isPending) return;

    logoutMutation.mutate(null, {
      onSuccess: ({ revoked }) => {
        queryClient.clear();
        if (!revoked) {
          alert(503, 'Signed out on this device, but the server could not be reached. Use Settings > Active sessions on another device to end this session remotely.');
        }
        navigateReplace('/');
      },
      onError: (error) => {
        alert(error.status || 500, error.message || 'Could not sign out, please try again.');
      }
    });
  };

  const name = data?.username || data?.email || 'Account';
  const points = formatPoints(data?.points);
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);

  const triggerButton = (
    <Button
      variant="ghost"
      className="h-9 gap-2 px-1.5 sm:px-2 data-[state=open]:bg-accent"
      aria-label={`Account menu for ${name}`}
    >
      <Avatar className="size-7 rounded-md">
        <AvatarImage src={data?.image || undefined} alt="" />
        <AvatarFallback className="rounded-md bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
          {initials(name)}
        </AvatarFallback>
      </Avatar>
      <span className="hidden max-w-[10rem] flex-col items-start leading-tight sm:flex">
        {isLoading ? (
          <Skeleton className="h-3.5 w-20" />
        ) : (
          <span className="max-w-full truncate text-[13px] font-medium">{name}</span>
        )}
        <span className="flex items-center gap-1 font-mono text-[11px] text-muted-foreground tabular">
          <LuCoins className="size-3 text-warning" aria-hidden="true" />
          {points} pts
        </span>
      </span>
      <LuChevronsUpDown className="hidden size-3.5 text-muted-foreground sm:block" aria-hidden="true" />
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetTrigger asChild>
          {triggerButton}
        </SheetTrigger>

        <SheetContent side="bottom" showCloseButton={false} className="flex max-h-[85vh] flex-col gap-0 rounded-t-2xl border-t bg-background p-0">
          <div className="mx-auto my-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30" aria-hidden="true" />
          <SheetHeader className="sr-only">
            <SheetTitle>Account menu</SheetTitle>
            <SheetDescription>Profile, settings and account navigation</SheetDescription>
          </SheetHeader>

          {/* User profile card */}
          <div className="flex items-center gap-3 p-4 border-b">
            <Avatar className="size-11 rounded-lg">
              <AvatarImage src={data?.image || undefined} alt="" />
              <AvatarFallback className="rounded-lg bg-primary-soft text-base font-semibold text-primary-soft-foreground">
                {initials(name)}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 leading-tight flex-1">
              <span className="truncate text-base font-semibold">{data?.username || '-'}</span>
              <span className="truncate text-xs text-muted-foreground">{data?.email || '-'}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-mono font-medium tabular">
              <LuCoins className="size-3.5 text-warning" aria-hidden="true" />
              {points}
            </div>
          </div>

          {/* Menu Items */}
          <div className="flex flex-col p-2 space-y-0.5">
            <Link
              href="/profile"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <LuUser className="size-4 text-muted-foreground" />
              <span>Profile</span>
            </Link>
            <Link
              href="/settings"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <LuSettings className="size-4 text-muted-foreground" />
              <span>Settings</span>
            </Link>
            <Link
              href="/help"
              onClick={() => setSheetOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <LuCircleHelp className="size-4 text-muted-foreground" />
              <span>Help center</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setSheetOpen(false);
                updateQuery({ modal: 'feedback' });
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <LuMessageSquareText className="size-4 text-muted-foreground" />
              <span>Send feedback</span>
            </button>
            <button
              type="button"
              onClick={() => {
                toggleTheme();
              }}
              className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              {theme === 'dark' ? <LuSun className="size-4 text-warning" /> : <LuMoon className="size-4 text-muted-foreground" />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </button>
          </div>

          {/* Log out */}
          <div className="p-3 border-t mt-auto">
            <Button
              variant="destructive"
              className="w-full h-11"
              onClick={(e) => {
                setSheetOpen(false);
                handleLogout(e);
              }}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? <LuLoaderCircle className="animate-spin" /> : <LuLogOut />}
              {logoutMutation.isPending ? 'Signing out...' : 'Log out'}
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

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2 font-normal">
          <Avatar className="size-9 rounded-md">
            <AvatarImage src={data?.image || undefined} alt="" />
            <AvatarFallback className="rounded-md bg-primary-soft text-sm font-semibold text-primary-soft-foreground">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-semibold">{data?.username || '-'}</span>
            <span className="truncate text-xs text-muted-foreground">{data?.email || '-'}</span>
          </span>
        </DropdownMenuLabel>
        <div className="mx-2 mb-1 flex items-center justify-between rounded-md bg-muted px-2.5 py-1.5 text-xs">
          <span className="text-muted-foreground">Reward points</span>
          <span className="flex items-center gap-1 font-mono font-medium tabular">
            <LuCoins className="size-3.5 text-warning" aria-hidden="true" />
            {points}
          </span>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href="/profile"><LuUser />Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/settings"><LuSettings />Settings</Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/help"><LuCircleHelp />Help center</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => updateQuery({ modal: 'feedback' })}>
            <LuMessageSquareText />Send feedback
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={toggleTheme}>
            {theme === 'dark' ? <LuSun /> : <LuMoon />}
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={handleLogout}
          disabled={logoutMutation.isPending}
        >
          {logoutMutation.isPending ? <LuLoaderCircle className="animate-spin" /> : <LuLogOut />}
          {logoutMutation.isPending ? 'Signing out...' : 'Log out'}
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
