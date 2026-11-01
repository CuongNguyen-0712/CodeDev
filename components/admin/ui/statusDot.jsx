import { cn } from "@/lib/utils";

// One mapping for every admin screen (docs/admin-panel-plan.md 5.3): an 8px dot and its word.
const TONES = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    neutral: "bg-muted-foreground/60",
};

export const STATUS_TONE = {
    // users
    active: "success", suspended: "warning", blocked: "danger", unverified: "neutral",
    // code runs
    completed: "success", running: "warning", failed: "danger", timeout: "danger", queued: "neutral", cancelled: "neutral",
    // courses
    published: "success", draft: "warning", archived: "danger", unpublished: "neutral",
    // services
    healthy: "success", ok: "success", degraded: "warning", down: "danger", unknown: "neutral",
    // dead letters
    resolved: "success", open: "danger",
};

const LABELS = { ok: "Healthy" };

export default function StatusDot({ status, label, className }) {
    const tone = TONES[STATUS_TONE[status] || "neutral"];
    const text = label || LABELS[status] || (status ? status.charAt(0).toUpperCase() + status.slice(1) : "Unknown");
    return (
        <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-sm", className)}>
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", tone)} />
            <span>{text}</span>
        </span>
    );
}
