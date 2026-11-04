'use client'
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { SessionProvider } from "next-auth/react"
import { AuthProvider } from "./authContext"
import { QueryProvider } from "./queryContext"
import { useThemeStore } from "@/stores/themeStore"
import { useUiStore } from "@/stores/uiStore"
import { TooltipProvider } from "@/components/shadcn/tooltip"
import AppToaster from "@/components/ui/alert"
import { LevelUpDialog, RankUpWatcher } from "@/components/ui/level"
import { RatePromptDialog } from "@/components/course/ratePromptDialog"
import { SignedIn } from "@/components/auth/signedIn"

// Stores start at the server-rendered defaults; saved browser values are read after mount so
// hydration matches (docs/state-management.md). Client navigations close the mobile sidebar.
function ClientStateBridge() {
    const pathname = usePathname();
    useEffect(() => {
        useThemeStore.getState().hydrate();
        useUiStore.getState().hydrate();
    }, []);
    useEffect(() => {
        useUiStore.getState().closeSidebarOnMobile();
    }, [pathname]);
    return null;
}

export function Provider({ children }) {
    return (
        <SessionProvider
            refetchInterval={60}
            refetchOnWindowFocus={true}
        >
            <AuthProvider>
                <QueryProvider>
                    <ClientStateBridge />
                    <TooltipProvider delayDuration={300}>
                        {children}
                    </TooltipProvider>
                    {/* The only toast region: survives navigation (see components/ui/alert.jsx). */}
                    <AppToaster />
                    <LevelUpDialog />
                    <RatePromptDialog />
                    <SignedIn><RankUpWatcher /></SignedIn>
                </QueryProvider>
            </AuthProvider>
        </SessionProvider>
    )
}
