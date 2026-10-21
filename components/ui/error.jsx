'use client';

import Link from "next/link";
import { useRouterActions } from "@/router/useRouterActions";
import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";

import { LuArrowLeft, LuHouse, LuRotateCw, LuTriangleAlert, LuUnlink, LuX } from "react-icons/lu";

function describe(data, title) {
    const status = typeof data === 'object'
        ? (data?.status || data?.statusCode || data?.response?.status || 500)
        : 500;

    const message = typeof data === 'string'
        ? data
        : (data?.message || data?.error || "An unexpected error occurred. Please try again.");

    const heading = title || (
        status === 404
            ? "Not found"
            : status === 401 || status === 403
                ? "Access denied"
                : "Could not load this data"
    );

    return { status, message, heading };
}

export function ErrorReload({
    data = null,
    refetch,
    callback = null,
    compact = false,
    title = null
}) {
    if (data === null || data === undefined) return null;

    const { status, message, heading } = describe(data, title);

    return (
        <div
            role="alert"
            className={cn(
                "flex w-full gap-3 rounded-lg border border-destructive/20 bg-destructive-soft/60",
                compact ? "items-start p-3" : "flex-col items-center px-6 py-10 text-center"
            )}
        >
            <span className={cn(
                "flex shrink-0 items-center justify-center rounded-md bg-destructive-soft text-destructive",
                compact ? "size-8" : "size-10"
            )}>
                <LuTriangleAlert className={compact ? "size-4" : "size-5"} aria-hidden="true" />
            </span>

            <div className={cn("min-w-0 space-y-1", compact && "flex-1")}>
                <p className="text-sm font-semibold text-foreground">{heading}</p>
                <p className="text-sm text-muted-foreground">{message}</p>
                {status && (
                    <p className="text-xs text-muted-foreground tabular">HTTP {status}</p>
                )}
            </div>

            {(refetch || callback) && (
                <div className={cn("flex shrink-0 gap-2", compact ? "self-center" : "mt-1")}>
                    {refetch && (
                        <Button variant="outline" size="sm" onClick={() => refetch()}>
                            <LuRotateCw />
                            Try again
                        </Button>
                    )}
                    {callback && (
                        <Button variant="ghost" size="sm" onClick={callback}>
                            <LuX />
                            Dismiss
                        </Button>
                    )}
                </div>
            )}
        </div>
    );
}

// `onRetry`: shown as "Try again" (route error boundaries pass Next's `reset`).
export function PageError({
    title = "Something went wrong",
    message = null,
    onRetry = null,
}) {
    const { navigateBack } = useRouterActions();

    return (
        <div className="flex min-h-[60vh] w-full items-center justify-center px-6 py-16" role="alert">
            <div className="flex max-w-md flex-col items-center gap-4 text-center">
                <span className="flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <LuUnlink className="size-6" aria-hidden="true" />
                </span>
                <div className="space-y-2">
                    <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                    <p className="text-sm text-muted-foreground">
                        {message || "The page you're looking for was moved, removed, or is temporarily unavailable."}
                    </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                    {onRetry ? (
                        <Button onClick={() => onRetry()}>
                            <LuRotateCw />
                            Try again
                        </Button>
                    ) : null}
                    <Button variant="outline" onClick={() => navigateBack()}>
                        <LuArrowLeft />
                        Go back
                    </Button>
                    <Button asChild variant={onRetry ? "outline" : "default"}>
                        <Link href="/"><LuHouse />Back to home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
