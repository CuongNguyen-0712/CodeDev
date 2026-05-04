'use client'
import { ThemeProvider } from "./themeContext"
import { SessionProvider } from "next-auth/react"
import { AuthProvider } from "./authContext"

export default function Provider({ children }) {
    return (
        <SessionProvider>
            <AuthProvider>
                <ThemeProvider>
                    {children}
                </ThemeProvider>
            </AuthProvider>
        </SessionProvider>
    )
}