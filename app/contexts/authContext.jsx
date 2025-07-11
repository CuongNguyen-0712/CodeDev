'use client'
import { useContext, createContext, useState } from "react";

const AuthContext = createContext();

export function AuthProvider({ children, initialSession }) {
    const [session, setSession] = useState(initialSession);

    const refreshSession = async () => {
        const res = await fetch("/api/get/getSession", {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
            },
            cache: "no-store"
        });
        const data = await res.json();
        setSession(data);
    };

    return (
        <AuthContext.Provider value={{ session, refreshSession }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => useContext(AuthContext);