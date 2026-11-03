'use client'
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./themeContext"
import { AuthProvider } from "./authContext"
import { QueryProvider } from "./queryContext"
import { AppProvider } from "./appContext"
import { TooltipProvider } from "@/components/shadcn/tooltip"
import AppToaster from "@/components/ui/alert"
import { LevelUpDialog, RankUpWatcher } from "@/components/ui/level"
import { RatePromptDialog } from "@/components/course/ratePromptDialog"
import { SignedIn } from "@/components/auth/signedIn"

export function Provider({ children }) {
    return (
        <SessionProvider
            refetchInterval={60}
            refetchOnWindowFocus={true}
        >
            <AuthProvider>
                <QueryProvider>
                    <ThemeProvider>
                        <AppProvider>
                            <TooltipProvider delayDuration={300}>
                                {children}
                            </TooltipProvider>
                            {/* The only toast region: survives navigation (see components/ui/alert.jsx). */}
                            <AppToaster />
                            <LevelUpDialog />
                            <RatePromptDialog />
                            <SignedIn><RankUpWatcher /></SignedIn>
                        </AppProvider>
                    </ThemeProvider>
                </QueryProvider>
            </AuthProvider>
        </SessionProvider>
    )
}
