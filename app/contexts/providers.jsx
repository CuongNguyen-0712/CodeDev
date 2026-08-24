'use client'
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./themeContext"
import { AuthProvider } from "./authContext"
import { QueryProvider } from "./queryContext"

export function Provider({ children }) {
    return (
        <SessionProvider
            refetchInterval={60}
            refetchOnWindowFocus={true}
        >
            <AuthProvider>
                <QueryProvider>
                    <ThemeProvider>
                        {children}
                    </ThemeProvider>
                </QueryProvider>
            </AuthProvider>
        </SessionProvider>
    )
}