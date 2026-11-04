'use client';

import { useThemeStore } from "@/stores/themeStore";

// Compatibility hook: the theme lives in stores/themeStore.js (hydrated in contexts/providers.jsx).
export const useTheme = () => ({
    theme: useThemeStore((s) => s.theme),
    toggleTheme: useThemeStore((s) => s.toggleTheme),
});
