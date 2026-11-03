// Course display helpers shared by client components (course cards) and the server-rendered course
// page, so they live outside any module that uses hooks.
import { LuSignal, LuSignalHigh, LuSignalLow, LuSignalMedium } from "react-icons/lu";

// Level is a neutral outline badge with a signal icon; the text label carries the meaning.
export const LEVEL_ICON = {
    beginner: LuSignalLow,
    intermediate: LuSignalMedium,
    advanced: LuSignalHigh,
    expert: LuSignal,
    master: LuSignal,
};

// Rendered width of a cover in the catalog grid and on the course page (the `sizes` of its srcset).
export const CARD_COVER_SIZES = "(min-width: 1280px) 360px, (min-width: 640px) 50vw, 100vw";
export const PAGE_COVER_SIZES = "(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw";

export const formatDuration = (minutes) => {
    const value = Number(minutes || 0);
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
};
