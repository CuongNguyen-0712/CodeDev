'use client';

import { useEffect } from "react";

/**
 * The app is a fixed-height shell (body is 100dvh, overflow hidden; pages scroll inside). iOS Safari
 * still scrolls the window to show a focused field when the keyboard opens, and when the keyboard
 * closes it sometimes leaves the window scrolled, so the shell sits above a blank band and the page
 * looks cut off. Scroll the window back whenever a field loses focus or the visual viewport is back
 * at full height. Renders nothing.
 */
export default function ViewportReset() {
    useEffect(() => {
        const reset = () => {
            if (window.scrollY || window.scrollX) window.scrollTo(0, 0);
        };
        // The keyboard closes a moment after the field blurs.
        const onFocusOut = () => setTimeout(reset, 80);
        const viewport = window.visualViewport;
        const onViewport = () => {
            if (!viewport || Math.abs(viewport.height - window.innerHeight) < 1) reset();
        };
        document.addEventListener("focusout", onFocusOut);
        viewport?.addEventListener("resize", onViewport);
        return () => {
            document.removeEventListener("focusout", onFocusOut);
            viewport?.removeEventListener("resize", onViewport);
        };
    }, []);
    return null;
}
