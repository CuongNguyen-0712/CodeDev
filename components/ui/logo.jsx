import { useId } from "react";

import { cn } from "@/lib/utils";

/*
 * CodeDev brand: a circuit brain mark and the `_CodeDev;` wordmark, both painted
 * with the --logo-* gradient from app/globals.css (lifted under .dark and
 * .logo-on-dark). public/image/static/logo.svg is the same compact mark for the
 * favicon, with its own prefers-color-scheme switch.
 */

const GRADIENT = "linear-gradient(90deg, var(--logo-start), var(--logo-mid) 55%, var(--logo-end))";

function GradientStops() {
    return (
        <>
            <stop offset="0" stopColor="var(--logo-start)" />
            <stop offset="0.55" stopColor="var(--logo-mid)" />
            <stop offset="1" stopColor="var(--logo-end)" />
        </>
    );
}

/**
 * The circuit brain on its own. At 20px and below the detailed traces blur
 * together, so the compact drawing (outline, one trace, two leads) is used.
 */
export function LogoMark({ size = 24, compact = size <= 20, title, className, ...props }) {
    // React ids contain characters that are awkward inside url(#...).
    const gradientId = `logo-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
    const paint = `url(#${gradientId})`;

    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 32 32"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            role={title ? "img" : undefined}
            aria-label={title}
            aria-hidden={title ? undefined : true}
            focusable="false"
            className={cn("shrink-0", className)}
            {...props}
        >
            <defs>
                <linearGradient id={gradientId} x1="3" y1="5" x2="29" y2="29" gradientUnits="userSpaceOnUse">
                    <GradientStops />
                </linearGradient>
            </defs>

            {compact ? (
                <>
                    <g stroke={paint} strokeWidth="2.8">
                        <path d="M13 23.5H9.2C6.2 23.5 4.3 21.3 4.6 18.7 3 17.2 3.1 14.4 4.9 13.1 4.5 10.1 6.8 7.8 9.8 8.2 10.6 5.6 13.4 4.3 15.9 5.3 17.6 3.7 20.9 3.8 22.4 5.6 25.2 5.3 27.6 7.3 27.8 10 29.9 11.4 30.2 14.6 28.5 16.3 28.9 19.5 26.6 22 23.4 21.9H19" />
                        <path d="M13 23.5V26M19 21.9V24.5M9.5 13.5H14L17.5 17" />
                    </g>
                    <g fill={paint}>
                        <circle cx="13" cy="28.2" r="2.3" />
                        <circle cx="19" cy="26.8" r="2.3" />
                        <circle cx="19.3" cy="18.8" r="2.3" />
                    </g>
                </>
            ) : (
                <>
                    <g stroke={paint}>
                        <path strokeWidth="2.2" d="M13.5 23H9.2C6.4 23 4.6 21 4.9 18.6 3.4 17.2 3.5 14.6 5.2 13.4 4.8 10.6 7 8.4 9.8 8.8 10.6 6.4 13.2 5.2 15.6 6.1 17.2 4.6 20.3 4.7 21.8 6.4 24.4 6.1 26.7 8 26.9 10.5 28.9 11.8 29.2 14.8 27.6 16.4 28 19.4 25.8 21.6 22.9 21.6H18.5" />
                        <path strokeWidth="1.8" d="M13.5 23V26.5M18.5 21.6V25M8.6 14.6H12.2L14.6 17M16 9.4V12.6L18.8 15.4M24.2 11.8H21.6V17.8" />
                    </g>
                    <g fill={paint}>
                        <circle cx="13.5" cy="28.2" r="1.7" />
                        <circle cx="18.5" cy="26.8" r="1.7" />
                        <circle cx="15.4" cy="17.8" r="1.5" />
                        <circle cx="19.6" cy="16.2" r="1.5" />
                        <circle cx="21.6" cy="19.4" r="1.5" />
                    </g>
                </>
            )}
        </svg>
    );
}

/** `_CodeDev;` in the code font. The underscore and semicolon are not read aloud. */
export function LogoWordmark({ className }) {
    return (
        <span
            className={cn("font-mono font-semibold tracking-tight bg-clip-text text-transparent", className)}
            style={{ backgroundImage: GRADIENT }}
        >
            <span aria-hidden="true">_</span>CodeDev<span aria-hidden="true">;</span>
        </span>
    );
}

/** Mark and wordmark side by side. `onDark` lifts the gradient on a dark panel in the light theme. */
export default function Logo({ size = 24, onDark = false, className, wordmarkClassName }) {
    return (
        <span className={cn("inline-flex items-center gap-2", onDark && "logo-on-dark", className)}>
            <LogoMark size={size} />
            <LogoWordmark className={wordmarkClassName} />
        </span>
    );
}
