'use client';
import Link from "next/link";
import { cn } from "@/lib/utils";
import { LogoMark, LogoWordmark } from "@/components/ui/logo";
import { usePathname } from "next/navigation";

import { useAuth } from "@/contexts/authContext";
import { useQueryParams } from "@/router/useQueryParams";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
  useSidebar,
} from "@/components/shadcn/sidebar";

import {
  LuHouse,
  LuCode,
  LuLibrary,
  LuMap,
  LuNewspaper,
  LuContact,
  LuTrophy,
  LuInfo,
  LuMessageSquareText,
  LuSettings,
  LuCircleHelp,
  LuLogIn,
} from "react-icons/lu";

const NAVIGATION = [
  {
    title: 'Workspace',
    items: [
      { name: 'Home', value: 'home', icon: LuHouse, access: 'auth' },
      { name: 'Learning', value: 'learning', icon: LuCode, access: 'auth' },
      { name: 'Courses', value: 'course', icon: LuLibrary, access: 'public' },
    ]
  },
  {
    title: 'Resources',
    items: [
      { name: 'Roadmap', value: 'roadmap', icon: LuMap, access: 'public' },
      { name: 'Blog', value: 'blog', icon: LuNewspaper, access: 'public' },
      { name: 'About', value: 'about', icon: LuInfo, access: 'public' },
    ]
  },
  {
    title: 'Community',
    items: [
      { name: 'Contacts', value: 'contact', icon: LuContact, access: 'auth' },
      { name: 'Leaderboard', value: 'ranking', icon: LuTrophy, access: 'auth' },
    ]
  },
];

function hrefFor(value, session) {
  if (value === 'home') return session ? '/home' : '/';
  return `/${value}`;
}

export default function Dashboard() {
  const { session, status } = useAuth();
  const pathname = usePathname();
  const updateQuery = useQueryParams();
  const { isMobile, setOpenMobile } = useSidebar();

  const menus = session
    ? NAVIGATION
    : NAVIGATION
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.access === 'public')
      }))
      .filter((section) => section.items.length > 0);

  const isItemActive = (value) => {
    if (value === 'home') {
      return pathname === '/' || pathname === '/home';
    }
    return pathname === `/${value}` || pathname.startsWith(`/${value}/`);
  };

  // Phones: 44px rows and 16px text, a comfortable thumb target in the sheet.
  const hit = isMobile ? "h-11 text-base [&>svg]:size-5" : undefined;

  // On phones the sidebar is a sheet; close it once a destination is picked.
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" aria-label="Main navigation">
      <SidebarHeader className="h-12 justify-center border-b border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild className={cn("font-semibold", hit)} tooltip="CodeDev">
              <Link href={hrefFor('home', session)} onClick={closeOnMobile}>
                <LogoMark size={20} />
                <LogoWordmark />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {status === 'loading' ? (
          <SidebarGroup>
            <SidebarMenu>
              {['72%', '58%', '80%', '64%', '76%', '52%'].map((width, index) => (
                <SidebarMenuItem key={index}>
                  <SidebarMenuSkeleton showIcon width={width} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ) : (
          menus.map((section) => (
            <SidebarGroup key={section.title}>
              <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active = isItemActive(item.value);
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.value}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.name}
                        className={cn("data-[active=true]:bg-primary-soft/70 data-[active=true]:text-primary-ink data-[active=true]:font-semibold", hit)}
                      >
                        <Link
                          href={hrefFor(item.value, session)}
                          aria-current={active ? 'page' : undefined}
                          onClick={closeOnMobile}
                        >
                          <Icon />
                          <span>{item.name}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          {session ? (
            <>
              <SidebarMenuItem>
                <SidebarMenuButton
                  className={hit}
                  tooltip="Send feedback"
                  onClick={() => {
                    closeOnMobile();
                    updateQuery({ modal: 'feedback' });
                  }}
                >
                  <LuMessageSquareText />
                  <span>Feedback</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isItemActive('help')} tooltip="Help" className={hit}>
                  <Link href="/help" onClick={closeOnMobile}>
                    <LuCircleHelp />
                    <span>Help</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isItemActive('settings')} tooltip="Settings" className={hit}>
                  <Link href="/settings" onClick={closeOnMobile}>
                    <LuSettings />
                    <span>Settings</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </>
          ) : status !== 'loading' && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                tooltip="Sign in"
                className={cn("bg-primary text-primary-foreground hover:bg-primary-hover hover:text-primary-foreground active:bg-primary-hover active:text-primary-foreground dark:text-white dark:hover:text-white", hit)}
              >
                <Link href="/auth" onClick={closeOnMobile}>
                  <LuLogIn />
                  <span>Sign in</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
