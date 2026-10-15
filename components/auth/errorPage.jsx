'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { LuHouse, LuInfo, LuRefreshCw, LuTriangleAlert } from 'react-icons/lu';

import { Button } from '@/components/shadcn/button';

export default function ErrorPage() {
    const errorMessages = {
        Configuration: {
            title: "Sign-in is unavailable",
            desc: "Sign-in is not configured correctly on our side right now.",
            tip: "Please try logging in again in a few moments."
        },
        AccessDenied: {
            title: "Access denied",
            desc: "You do not have the required permissions or your sign-in attempt was rejected by the provider.",
            tip: "Make sure you allowed CodeDev access when GitHub or Google asked."
        },
        Verification: {
            title: "Link expired",
            desc: "The sign-in link or token has expired or has already been used.",
            tip: "Start the sign-in again to get a new link."
        },
        Callback: {
            title: "Provider sign-in failed",
            desc: "We encountered an error while communicating with the third-party authentication service.",
            tip: "Check your internet connection and try again."
        },
        SessionInvalid: {
            title: "Session not valid",
            desc: "Your session token could not be verified or is corrupt.",
            tip: "Sign in again to establish a secure session."
        },
        SessionRevoked: {
            title: "Session ended",
            desc: "Your active session was revoked or signed out from another device.",
            tip: "Enter your credentials to sign in."
        },
        OAuthSignin: {
            title: "Could not reach the provider",
            desc: "We could not start sign-in with GitHub or Google.",
            tip: "Check your connection and try again in a moment."
        },
        OAuthCallback: {
            title: "Provider sign-in failed",
            desc: "GitHub or Google returned an unexpected response.",
            tip: "Start the sign-in again from the sign-in page."
        },
        OAuthAccountNotLinked: {
            title: "Email already in use",
            desc: "This email is already linked to another sign-in method on CodeDev.",
            tip: "Sign in with the method you used first (username or the other provider)."
        },
        CredentialsSignin: {
            title: "Sign-in failed",
            desc: "The username or password is incorrect.",
            tip: "Check your details and try again."
        },
        SessionRequired: {
            title: "Sign in required",
            desc: "You need to be signed in to open that page.",
            tip: "Sign in, then open the page again."
        },
        SessionExpired: {
            title: "Session expired",
            desc: "Your login session has timed out due to inactivity.",
            tip: "Sign in again to continue where you left off."
        },
        Default: {
            title: "Sign-in failed",
            desc: "An unexpected error occurred during the sign-in or registration process.",
            tip: "Try signing in again. If it keeps happening, let us know through the Help page."
        }
    };

    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    const errorDetails = errorMessages[error] || errorMessages.Default;

    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-16 sm:px-6">
            <div className="flex w-full max-w-md flex-col items-start gap-5">
                <span className="flex size-11 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
                    <LuTriangleAlert className="size-5" aria-hidden="true" />
                </span>

                <div className="flex flex-col gap-2">
                    <p className="text-sm text-muted-foreground">Sign-in problem</p>
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {errorDetails.title}
                    </h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">{errorDetails.desc}</p>
                </div>

                <div className="flex w-full items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm">
                    <LuInfo className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <p className="text-foreground">{errorDetails.tip}</p>
                </div>

                {error && (
                    <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        Error code
                        <code className="rounded-sm border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
                            {error}
                        </code>
                    </p>
                )}

                <div className="flex flex-wrap gap-2">
                    <Button asChild>
                        <Link href="/auth">
                            <LuRefreshCw />
                            Try signing in again
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/">
                            <LuHouse />
                            Back to home
                        </Link>
                    </Button>
                </div>
            </div>
        </main>
    );
}
