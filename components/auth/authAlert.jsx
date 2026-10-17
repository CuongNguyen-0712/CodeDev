'use client';

import { LuCircleAlert, LuCircleCheck, LuInfo, LuX } from "react-icons/lu";
import { cn } from "@/lib/utils";

/**
 * Inline alert banner designed specifically for auth forms.
 * Replaces intrusive toast popups with an in-form, accessible, and dismissible feedback message.
 *
 * @param {string | { message: string, actionLabel?: string, onAction?: () => void }} error
 * @param {'destructive' | 'warning' | 'info' | 'success'} variant
 * @param {() => void} onDismiss
 * @param {string} className
 */
export default function AuthAlert({
    error,
    variant = "destructive",
    onDismiss,
    className,
}) {
    if (!error) return null;

    const message = typeof error === "object" ? error?.message : error;
    const actionLabel = typeof error === "object" ? error?.actionLabel : null;
    const onAction = typeof error === "object" ? error?.onAction : null;

    if (!message) return null;

    const Icon = variant === "success"
        ? LuCircleCheck
        : variant === "info"
            ? LuInfo
            : LuCircleAlert;

    const variantStyles = {
        destructive: "border-destructive/25 bg-destructive-soft text-destructive",
        warning: "border-warning/30 bg-warning-soft text-warning",
        info: "border-info/25 bg-info-soft text-info",
        success: "border-success/25 bg-success-soft text-success",
    }[variant] || "border-destructive/25 bg-destructive-soft text-destructive";

    return (
        <div
            role="alert"
            aria-live="polite"
            className={cn(
                "relative flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-xs sm:text-sm transition-all duration-200 animate-in fade-in-50 slide-in-from-top-1",
                variantStyles,
                className
            )}
        >
            <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex-1 space-y-1">
                <p className="leading-relaxed font-medium">{message}</p>
                {actionLabel && typeof onAction === "function" && (
                    <button
                        type="button"
                        onClick={onAction}
                        className="inline-flex items-center text-xs font-semibold underline underline-offset-4 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-xs"
                    >
                        {actionLabel}
                    </button>
                )}
            </div>
            {typeof onDismiss === "function" && (
                <button
                    type="button"
                    onClick={onDismiss}
                    className="ml-auto -mr-1 -mt-0.5 inline-flex size-5 items-center justify-center rounded-sm opacity-70 transition-opacity hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label="Dismiss message"
                >
                    <LuX className="size-3.5" aria-hidden="true" />
                </button>
            )}
        </div>
    );
}
