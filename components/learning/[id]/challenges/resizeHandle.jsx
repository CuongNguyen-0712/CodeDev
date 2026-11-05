'use client';

import { useRef } from "react";

import { cn } from "@/lib/utils";

const KEY_STEP = 24;

/**
 * Drag handle that resizes the neighbouring panel: `axis` "y" changes a height (drag down to
 * grow), "x" a width (`invert`: drag left to grow, for a panel on the right). Pointer (mouse,
 * pen, touch) and keyboard (arrows, Home/End). `value` and the result of onChange are pixels.
 */
export default function ResizeHandle({ axis = "y", value, min, max, onChange, invert = false, label, className }) {
    const dragRef = useRef(null);
    const clamp = (n) => Math.round(Math.min(max, Math.max(min, n)));

    const onPointerDown = (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragRef.current = { start: axis === "y" ? event.clientY : event.clientX, value };
    };
    const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        const delta = (axis === "y" ? event.clientY : event.clientX) - drag.start;
        onChange(clamp(drag.value + (invert ? -delta : delta)));
    };
    const onPointerUp = (event) => {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };
    const onKeyDown = (event) => {
        const grow = axis === "y" ? "ArrowDown" : invert ? "ArrowLeft" : "ArrowRight";
        const shrink = axis === "y" ? "ArrowUp" : invert ? "ArrowRight" : "ArrowLeft";
        const next = event.key === grow ? value + KEY_STEP
            : event.key === shrink ? value - KEY_STEP
                : event.key === "Home" ? min
                    : event.key === "End" ? max
                        : null;
        if (next === null) return;
        event.preventDefault();
        onChange(clamp(next));
    };

    return (
        <div
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation={axis === "y" ? "horizontal" : "vertical"}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={value}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
            className={cn(
                "group relative flex shrink-0 touch-none items-center justify-center bg-editor-panel outline-none select-none focus-visible:ring-2 focus-visible:ring-editor-accent/60 focus-visible:ring-inset",
                axis === "y" ? "h-3 w-full cursor-row-resize" : "w-2 cursor-col-resize self-stretch",
                className
            )}
        >
            {/* Grip: the visible part of a larger hit area. */}
            <span
                aria-hidden="true"
                className={cn(
                    "rounded-full bg-editor-border transition-colors group-hover:bg-editor-muted group-focus-visible:bg-editor-accent",
                    axis === "y" ? "h-1 w-10" : "h-10 w-1"
                )}
            />
        </div>
    );
}
