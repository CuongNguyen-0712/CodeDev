'use client';

import { useState, useEffect } from "react";
import { LogoMark } from "@/components/ui/logo";
import { Spinner } from "@/components/shadcn/spinner";

// Content skeleton that preserves the shell (navbar + sidebar) while a page suspends (UX-106)
export function PageSkeleton() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10" role="status" aria-busy="true" aria-label="Loading page content">
            <div className="space-y-3">
                <div className="h-8 w-56 rounded-md bg-muted-foreground/20 animate-pulse" />
                <div className="h-4 w-96 max-w-full rounded-md bg-muted-foreground/20 animate-pulse" />
            </div>
            <div className="h-10 w-full rounded-md bg-muted-foreground/20 animate-pulse" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
                        <div className="aspect-video w-full rounded-md bg-muted-foreground/20 animate-pulse" />
                        <div className="h-4 w-3/4 rounded-md bg-muted-foreground/20 animate-pulse" />
                        <div className="h-3 w-1/2 rounded-md bg-muted-foreground/20 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}

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
    );
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
    );
}
