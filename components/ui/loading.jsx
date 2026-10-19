'use client'
import { useState, useEffect } from "react"
import { LogoMark } from "@/components/ui/logo"

import { Spinner } from "@/components/shadcn/spinner"

// Full-page fallback shown while a route segment loads.
export function LoadingRedirect() {
    const [message, setMessage] = useState(null);

    useEffect(() => {
        const timers = [
            setTimeout(() => setMessage("Still loading..."), 5000),
            setTimeout(() => setMessage("This is taking longer than usual."), 12000),
        ];
        return () => timers.forEach(clearTimeout);
    }, []);

    return (
        <div className="flex h-dvh w-full flex-col items-center justify-center gap-4 bg-background" role="status" aria-live="polite">
            <LogoMark size={28} />
            <Spinner className="size-5 text-primary-ink" aria-hidden="true" />
            <p className="min-h-5 text-sm text-muted-foreground">
                {message ?? <span className="sr-only">Loading CodeDev</span>}
            </p>
        </div>
    )
}

// Inline loading state. `scale` and `color` are kept for existing callers
// (buttons pass a light colour on dark fills).
export function LoadingContent({ scale = 1, color, message = null }) {
    const size = Math.max(12, Math.round(24 * scale));

    return (
        <div className="flex flex-col items-center justify-center gap-2" role="status" aria-live="polite">
            <Spinner
                aria-hidden="true"
                className={color ? undefined : "text-primary-ink"}
                style={{ width: size, height: size, color }}
            />
            {message ? (
                <p className="text-sm text-muted-foreground">{message}</p>
            ) : (
                <span className="sr-only">Loading</span>
            )}
        </div>
    )
}
