// Formatting for the admin screens (docs/admin-panel-plan.md 5.6): numbers with separators,
// ISO dates in tables, relative times for "last active", durations as "48 s" / "1 m 12 s".

const number = new Intl.NumberFormat("en-US");
const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export const formatNumber = (value) => (value == null || Number.isNaN(Number(value)) ? "—" : number.format(Number(value)));

export function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "—" : date.toISOString().slice(0, 10);
}

export function formatDateTime(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

const STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];

export function formatRelative(value, now = Date.now()) {
    if (!value) return "—";
    const seconds = Math.round((new Date(value).getTime() - now) / 1000);
    if (Number.isNaN(seconds)) return "—";
    for (const [unit, size] of STEPS) {
        // Whole units only: 36 hours ago is "1 day ago", not a rounded-up "2 days ago".
        if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
    }
    return "just now";
}

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
