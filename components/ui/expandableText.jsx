'use client'
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";

/**
 * Long text clamped to `clampClass` (a Tailwind line-clamp-N class) with a Show more / Show less
 * toggle. The toggle only appears when the text is actually cut off at the current width.
 */
export default function ExpandableText({ children, clampClass = "line-clamp-4", className }) {
    const id = useId();
    const ref = useRef(null);
    const [expanded, setExpanded] = useState(false);
    const [clamped, setClamped] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el || expanded) return;
        // Re-measured on resize: a phone cuts the text off sooner than a desktop.
        const observer = new ResizeObserver(() => setClamped(el.scrollHeight > el.clientHeight + 1));
        observer.observe(el);
        return () => observer.disconnect();
    }, [expanded, children]);

    return (
        <div className="space-y-1.5">
            <p ref={ref} id={id} className={cn(className, !expanded && clampClass)}>
                {children}
            </p>
            {(clamped || expanded) && (
                <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto px-0"
                    aria-expanded={expanded}
                    aria-controls={id}
                    onClick={() => setExpanded((value) => !value)}
                >
                    {expanded ? "Show less" : "Show more"}
                </Button>
            )}
        </div>
    );
}
