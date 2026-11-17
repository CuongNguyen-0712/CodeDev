'use client'
import { useEffect } from "react";

// Keeps --app-height equal to the visual viewport while mounted, so a bottom-pinned composer rides above the
// on-screen keyboard (iOS keeps the layout viewport full height). Only the messages layout mounts it.
export function useVisualViewportHeight() {
    useEffect(() => {
        const vv = window.visualViewport;
        if (!vv) return;
        const root = document.documentElement;
        const onResize = () => root.style.setProperty("--app-height", `${Math.round(vv.height * vv.scale)}px`);
        // iOS scrolls the layout viewport to reveal the focused input; pin it back (not while pinch-zoomed: that is the reader panning).
        const onScroll = () => { if (vv.offsetTop > 0 && vv.scale <= 1.01) window.scrollTo(0, 0); };
        vv.addEventListener("resize", onResize);
        vv.addEventListener("scroll", onScroll);
        return () => {
            vv.removeEventListener("resize", onResize);
            vv.removeEventListener("scroll", onScroll);
            root.style.removeProperty("--app-height");
        };
    }, []);
}
