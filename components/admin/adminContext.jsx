'use client';

import { createContext, useCallback, useContext, useMemo } from "react";

const AdminContext = createContext({ can: () => false, environment: "development" });

/**
 * Admin viewer state for client components: `can(permission)` decides which controls are shown.
 * Every API re-checks the caller's permissions in the database, so this is never the boundary.
 */
export function AdminProvider({ permissions = [], environment = "development", children }) {
    const granted = useMemo(() => new Set(permissions), [permissions]);
    const can = useCallback((permission) => granted.has(permission), [granted]);
    const value = useMemo(() => ({ can, environment }), [can, environment]);

    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export const useAdmin = () => useContext(AdminContext);
