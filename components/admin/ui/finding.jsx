import { cn } from "@/lib/utils";

const DOT = { good: "bg-success", attention: "bg-warning", critical: "bg-destructive" };

/**
 * The screen's one finding (the line under the title). A tone marks it with a status dot and lifts
 * it to ink so it is read first; a critical one pings once in a while (off with reduced motion).
 */
export default function Finding({ tone, children }) {
    if (!tone) return children;
    return (
        <span className="inline-flex items-start gap-2 text-foreground">
            <span aria-hidden="true" className="relative mt-1.5 inline-flex size-2 shrink-0">
                {tone === "critical" && <span className="absolute inset-0 rounded-full bg-destructive opacity-60 motion-safe:animate-ping" />}
                <span className={cn("relative size-2 rounded-full", DOT[tone])} />
            </span>
            <span>{children}</span>
        </span>
    );
}

/** Plural helper for findings: plural(3, "draft") → "3 drafts". */
export const plural = (count, word, many = `${word}s`) => `${count.toLocaleString("en-US")} ${count === 1 ? word : many}`;
