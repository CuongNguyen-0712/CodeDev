// Formatting shared by learner and admin screens. Relative times for "last active" and inbox
// items: whole units only, so 36 hours ago is "1 day ago", not a rounded-up "2 days ago".

const relative = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const STEPS = [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]];

export function formatRelative(value, now = Date.now()) {
    if (!value) return "—";
    const seconds = Math.round((new Date(value).getTime() - now) / 1000);
    if (Number.isNaN(seconds)) return "—";
    for (const [unit, size] of STEPS) {
        if (Math.abs(seconds) >= size) return relative.format(Math.trunc(seconds / size), unit);
    }
    return "just now";
}
