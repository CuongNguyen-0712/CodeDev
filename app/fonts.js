import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

// Interface text. Exposed as --font-plus-jakarta; app/globals.css maps it
// to --font-body (body, font-sans).
export const fontSans = Plus_Jakarta_Sans({
    subsets: ["latin", "vietnamese"],
    weight: ["400", "500", "600", "700"],
    variable: "--font-plus-jakarta",
    display: "swap",
});

// Code, metrics and identifiers.
export const fontMono = JetBrains_Mono({
    subsets: ["latin", "vietnamese"],
    weight: ["400", "500"],
    variable: "--font-jetbrains-mono",
    display: "swap",
});

export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;
