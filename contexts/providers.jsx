'use client'
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./themeContext"
import { AuthProvider } from "./authContext"
import { QueryProvider } from "./queryContext"
import { AppProvider } from "./appContext"
import { TooltipProvider } from "@/components/shadcn/tooltip"

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
                        </AppProvider>
                    </ThemeProvider>
                </QueryProvider>
            </AuthProvider>
        </SessionProvider>
    )
}
