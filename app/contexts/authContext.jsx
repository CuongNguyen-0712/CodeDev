'use client';

import { createContext, useContext, useMemo } from "react";
import { useSession, signOut, signIn } from "next-auth/react";

const AuthContext = createContext(null);

function normalizeSession(session) {
    if (!session?.user) return null;

    return {
        userId: session.user.userId,
        username: session.user.username || session.user.name,
        email: session.user.email,
        provider: session.user.provider,
    };
}

export function AuthProvider({ children }) {
    const { data: session, status, update } = useSession();

    const normalized = useMemo(() => normalizeSession(session), [session]);

    const value = useMemo(() => ({
        session: normalized,

        status,
        isAuthenticated: status === "authenticated",

        signIn,
        signOut,

        refreshSession: async () => {
            await update();
        },

    }), [normalized, status, update]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
    return ctx;
};