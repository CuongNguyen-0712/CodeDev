'use client'
import { SessionProvider } from "next-auth/react"
import { ThemeProvider } from "./themeContext"
import { AuthProvider } from "./authContext"
import QueryProvider from "./queryContext"

export default function Provider({ children }) {
    return (
        <SessionProvider
            refetchOnWindowFocus={false}
            refetchInterval={0}
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