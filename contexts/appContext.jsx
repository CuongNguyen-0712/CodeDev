'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

import { notify } from '@/components/ui/alert';

const AppContext = createContext(null);

const STORAGE_KEY = 'codedev_dashboard_state';

export const AppProvider = ({ children }) => {
    const pathname = usePathname();
    const [overlay, setOverlayState] = useState(null);
    // Starts open, the desktop default, so the server render already shows the labelled sidebar and
    // the layout does not jump after hydration. Below 768 px the desktop sidebar is hidden (a Sheet is used).
    const [isDashboard, setIsDashboard] = useState(true);
    const [isRedirect, setIsRedirect] = useState(false);

    useEffect(() => {
        // shortcut: users who collapsed the sidebar still see one collapse after hydration; reading the
        // sidebar_state cookie on the server would remove it but makes every route dynamic.
        try {
            if (window.innerWidth < 768) {
                // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of viewport/storage after hydration (see shortcut above)
                setIsDashboard(false);
                return;
            }
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null) setIsDashboard(Boolean(JSON.parse(saved)));
        } catch {
            // Unreadable storage keeps the default.
        }
    }, []);

    // Navigating closes overlays and, below 768 px (same boundary as hooks/use-mobile.js, where the
    // sidebar is a Sheet), the sidebar. Adjusted during render; only client navigations get here.
    const [prevPathname, setPrevPathname] = useState(pathname);
    if (prevPathname !== pathname) {
        setPrevPathname(pathname);
        if (window.innerWidth < 768) setIsDashboard(false);
        setOverlayState(null);
    }

    const setOverlay = useCallback((value) => {
        setOverlayState((prev) => {
            const next = typeof value === 'function' ? value(prev) : value;
            return next || null;
        });
    }, []);

    const closeOverlay = useCallback(() => {
        setOverlayState(null);
    }, []);

    const setDashboard = useCallback((value) => {
        setIsDashboard((prev) => {
            const next = typeof value === 'function' ? value(prev) : Boolean(value);
            if (typeof window !== 'undefined' && window.innerWidth >= 768) {
                try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                } catch {
                    return prev;
                }
            }
            return next;
        });
    }, []);

    const isAccountMobile = overlay === 'account';

    const setAccountMobile = useCallback((value) => {
        setOverlayState((prev) => {
            const current = prev === 'account';
            const next = typeof value === 'function' ? value(current) : value;
            return next ? 'account' : (prev === 'account' ? null : prev);
        });
    }, []);

    // Goes straight to the toast store (not through state): the single AppToaster in the root
    // providers owns each toast's timer, so navigation can neither replay nor restart it.
    // `options.id` collapses repeats of one event (e.g. a realtime event delivered twice).
    const showAlert = useCallback((status, message, callback, options) => {
        notify(status, message, { callback, ...options });
    }, []);

    const setRedirect = useCallback((value) => {
        setIsRedirect(Boolean(value));
    }, []);

    const value = useMemo(() => ({
        overlay,
        setOverlay,
        closeOverlay,
        isDashboard,
        setDashboard,
        isAccountMobile,
        setAccountMobile,
        isRedirect,
        setRedirect,
        showAlert,
    }), [
        overlay,
        setOverlay,
        closeOverlay,
        isDashboard,
        setDashboard,
        isAccountMobile,
        setAccountMobile,
        isRedirect,
        setRedirect,
        showAlert,
    ]);

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        return {
            overlay: null,
            setOverlay: () => { },
            closeOverlay: () => { },
            isDashboard: false,
            setDashboard: () => { },
            isAccountMobile: false,
            setAccountMobile: () => { },
            isRedirect: false,
            setRedirect: () => { },
            showAlert: (status, message, callback, options) => notify(status, message, { callback, ...options }),
        };
    }
    return context;
};