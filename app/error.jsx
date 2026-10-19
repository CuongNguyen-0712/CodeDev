'use client';

import { useEffect } from "react";

import { PageError } from "@/components/ui/error";

// Route error boundary: an uncaught render error in any page shows this inside the root layout
// (providers, toasts and theme keep working). redirect() and notFound() are not caught here.
export default function RouteError({ error, reset }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-background">
            <PageError
                title="Something went wrong"
                message="This page failed to load. Try again, or go back to where you were."
                onRetry={reset}
            />
        </main>
    );
}
