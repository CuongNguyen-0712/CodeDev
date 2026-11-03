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

export const formatDuration = (minutes) => {
    const value = Number(minutes || 0);
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
};
