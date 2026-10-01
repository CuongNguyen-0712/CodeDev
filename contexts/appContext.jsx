'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { usePathname } from 'next/navigation';

const AppContext = createContext(null);

const STORAGE_KEY = 'codedev_dashboard_state';

export const AppProvider = ({ children }) => {
    const pathname = usePathname();
    const [overlay, setOverlayState] = useState(null);
    const [isDashboard, setIsDashboard] = useState(false);
    const [alert, setAlert] = useState(null);
    const [isRedirect, setIsRedirect] = useState(false);

    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved !== null && typeof window !== 'undefined' && window.innerWidth >= 768) {
                setIsDashboard(JSON.parse(saved));
            }
        } catch {
            setIsDashboard(false);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth <= 768) {
            setIsDashboard(false);
        }
        setOverlayState(null);
    }, [pathname]);

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

    const showAlert = useCallback((status, message, callback) => {
        setAlert({ status, message, callback });
    }, []);

    const clearAlert = useCallback(() => {
        setAlert(null);
    }, []);

    const setRedirect = useCallback((value) => {
        setIsRedirect(Boolean(value));
    }, []);

    useEffect(() => {
        let frameId;

        const updateBackdrop = () => {
            const el = document.getElementById('overlay') || document.getElementById('backdrop');
            if (!el) return;

            const dashboardEl = document.getElementById('dashboard') || document.getElementById('aside');

            let shouldShow = false;
            if (isDashboard && typeof window !== 'undefined' && window.innerWidth <= 768 && Boolean(dashboardEl)) {
                shouldShow = true;
            } else if (overlay === 'account' && typeof window !== 'undefined' && window.innerWidth <= 425) {
                shouldShow = true;
            } else if (Boolean(overlay)) {
                shouldShow = true;
            }

            if (shouldShow) {
                el.classList.remove('hidden');
                el.setAttribute('aria-hidden', 'false');
            } else {
                el.classList.add('hidden');
                el.setAttribute('aria-hidden', 'true');
            }
        };

        frameId = requestAnimationFrame(updateBackdrop);
        window.addEventListener('resize', updateBackdrop);

        return () => {
            cancelAnimationFrame(frameId);
            window.removeEventListener('resize', updateBackdrop);
        };
    }, [isDashboard, overlay, pathname]);

    useEffect(() => {
        const el = document.getElementById('overlay') || document.getElementById('backdrop');
        if (!el) return;

        const handleBackdropClick = (e) => {
            if (e.target === el) {
                setOverlayState(null);
                if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                    setIsDashboard(false);
                }
            }
        };

        el.addEventListener('click', handleBackdropClick);
        return () => {
            el.removeEventListener('click', handleBackdropClick);
        };
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
        alert,
        showAlert,
        clearAlert,
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
        alert,
        showAlert,
        clearAlert,
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
            alert: null,
            showAlert: () => { },
            clearAlert: () => { },
        };
    }
    return context;
};