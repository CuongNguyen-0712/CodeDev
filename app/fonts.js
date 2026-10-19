import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

// Fallbacks apply while the web fonts load (display: swap) and if they fail.
// The full system stacks live in app/globals.css (--font-body, --font-code),
// after these variables. Every family listed there covers Vietnamese.

// Interface text. Exposed as --font-plus-jakarta; app/globals.css maps it
// to --font-body (body, font-sans). No `fallback` option here on purpose: with
// Turbopack it replaces the size-adjusted "Plus Jakarta Sans Fallback" face
// (adjustFontFallback) that keeps the font swap from shifting the layout.
export const fontSans = Plus_Jakarta_Sans({
    subsets: ["latin", "vietnamese"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-plus-jakarta",
    display: "swap",
});

// Code, metrics and identifiers. next/font would size-adjust Arial as the
// fallback, which is proportional: code would lose its columns (and the
// editor its caret alignment) until the font loads. Fall back to a real
// monospace face instead (next/font only accepts literal options).
export const fontMono = JetBrains_Mono({
    subsets: ["latin", "vietnamese"],
    weight: ["400", "500"],
    variable: "--font-jetbrains-mono",
    display: "swap",
    adjustFontFallback: false,
    fallback: ["ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "Liberation Mono", "DejaVu Sans Mono", "monospace"],
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
