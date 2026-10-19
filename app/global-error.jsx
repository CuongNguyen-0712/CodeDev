'use client';

import './globals.css';

import { useEffect } from "react";

import { fontVariables } from './fonts';

// Last-resort boundary for errors in the root layout itself, so it renders its own <html>
// without the app providers. Kept dependency-free on purpose.
export default function GlobalError({ error, reset }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en" className={fontVariables}>
            <body>
                <main className="flex min-h-dvh w-full items-center justify-center bg-background px-6 py-16" role="alert">
                    <div className="flex max-w-md flex-col items-center gap-4 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Something went wrong</h1>
                        <p className="text-sm text-muted-foreground">
                            CodeDev failed to load. Try again, or come back in a moment.
                        </p>
                        <div className="flex flex-wrap justify-center gap-2">
                            <button
                                type="button"
                                onClick={() => reset()}
                                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
                            >
                                Try again
                            </button>
                            <a
                                href="/"
                                className="inline-flex h-9 items-center rounded-md border border-input px-4 text-sm font-medium text-foreground hover:bg-accent"
                            >
                                Back to home
                            </a>
                        </div>
                    </div>
                </main>
            </body>
        </html>
    );
}
