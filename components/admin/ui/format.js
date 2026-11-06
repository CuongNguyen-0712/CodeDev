// Formatting for the admin screens (docs/admin-panel-plan.md 5.6): numbers with separators,
// ISO dates in tables, relative times for "last active", durations as "48 s" / "1 m 12 s".
// Dates and times are shown in the viewer's admin time zone (lib/timeZone.js, Settings > Time zone).

import { getDisplayTimeZone } from "@/lib/timeZone";

const number = new Intl.NumberFormat("en-US");

export const formatNumber = (value) => (value == null || Number.isNaN(Number(value)) ? "—" : number.format(Number(value)));

export function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    // en-CA writes YYYY-MM-DD.
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-CA", { timeZone: getDisplayTimeZone() });
}

export function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: getDisplayTimeZone() });
}

/** "14:05" in the admin time zone. */
export function formatTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: getDisplayTimeZone() });
}

export { formatRelative } from "@/lib/format";

export function formatDuration(seconds) {
    if (seconds == null || Number.isNaN(Number(seconds))) return "—";
    const total = Math.max(0, Math.round(Number(seconds)));
    if (total < 60) return `${total} s`;
    const minutes = Math.floor(total / 60);
    if (minutes < 60) return `${minutes} m ${total % 60} s`;
    return `${Math.floor(minutes / 60)} h ${minutes % 60} m`;
}

/** "+14 vs yesterday", "-3 vs yesterday", "+4 (new)" from zero, "—" with nothing to compare. */
export function formatChange(current, previous, window) {
    if (previous == null || current == null) return null;
    const diff = Number(current) - Number(previous);
    if (Number(previous) === 0) return Number(current) === 0 ? `0 ${window}` : `+${formatNumber(current)} (new)`;
    return `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${formatNumber(Math.abs(diff))} ${window}`;
}
