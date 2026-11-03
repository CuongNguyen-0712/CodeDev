'use client';

import { useState } from "react";

import { formatNumber } from "@/components/admin/ui/format";
import { cn } from "@/lib/utils";

/** Round, even axis steps with the top tick above the maximum (0/5/10/15, 0/25/50/75...). */
export function niceTicks(max, count = 4) {
    if (!max || max <= 0) return [0, 1];
    const rough = max / count;
    const power = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((candidate) => candidate >= rough) || power * 10;
    const ticks = [];
    for (let value = 0; value <= max + step / 2 && ticks.length <= count + 1; value += step) ticks.push(Math.round(value * 100) / 100);
    if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
    return ticks;
}

/**
 * One series of columns (docs/admin-panel-plan.md 5.6): square corners, the series in the one data
 * hue, 3-5 faint gridlines, round ticks, no legend, and the numbers in a table for screen readers.
 * A readout above names the peak, or the bar under the pointer or picked with the arrow keys.
 */
export default function BarChart({ data, label, width = 640, height = 180, className, formatLabel = (value) => value }) {
    const [active, setActive] = useState(null);
    const pad = { top: 8, right: 8, bottom: 22, left: 36 };
    const max = Math.max(0, ...data.map((point) => point.value));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] || 1;
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;
    const slot = plotW / Math.max(1, data.length);
    const barW = Math.max(2, slot * 0.62);
    const y = (value) => pad.top + plotH - (value / top) * plotH;
    const labelled = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);
    const total = data.reduce((sum, point) => sum + point.value, 0);
    const peak = data.reduce((best, point, index) => (point.value > (data[best]?.value ?? -1) ? index : best), 0);
    const shown = data[active ?? peak];
    const move = (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (event.key === "Escape") return setActive(null);
        if (!step || !data.length) return;
        event.preventDefault();
        setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? peak) + step)));
    };

    return (
        <figure className={cn("w-full", className)}>
            {shown && (
                <figcaption className="mb-1 flex items-baseline gap-1.5 text-xs text-muted-foreground" aria-live="polite">
                    <span>{active == null ? "Peak" : formatLabel(shown.label)}</span>
                    <span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(shown.value)}</span>
                    {active == null && shown.value > 0 && <span>on {formatLabel(shown.label)}</span>}
                </figcaption>
            )}
            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-auto w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                role="img"
                aria-label={`${label}: ${formatNumber(total)} in total. Arrow keys move between days.`}
                tabIndex={0}
                onKeyDown={move}
                onMouseLeave={() => setActive(null)}
                onBlur={() => setActive(null)}
            >
                {ticks.map((tick) => (
                    <g key={tick}>
                        <line x1={pad.left} x2={width - pad.right} y1={y(tick)} y2={y(tick)} className="stroke-border" strokeWidth={tick === 0 ? 1.5 : 1} />
                        <text x={pad.left - 6} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                            {formatNumber(tick)}
                        </text>
                    </g>
                ))}
                {data.map((point, index) => {
                    const x = pad.left + index * slot + (slot - barW) / 2;
                    const barTop = y(point.value);
                    return (
                        <g key={point.label} onMouseEnter={() => setActive(index)}>
                            {/* The whole column answers the pointer, so a short bar or a zero day is easy to hit. */}
                            <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} className="fill-transparent" />
                            {point.value > 0 && (
                                <rect x={x} y={barTop} width={barW} height={pad.top + plotH - barTop} className={cn("fill-primary-ink transition-opacity", active != null && active !== index && "opacity-40")} data-bar style={{ "--i": index }}>
                                    <title>{`${formatLabel(point.label)}: ${formatNumber(point.value)}`}</title>
                                </rect>
                            )}
                            {labelled.has(index) && (
                                <text x={x + barW / 2} y={height - 6} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                                    {formatLabel(point.label)}
                                </text>
                            )}
                        </g>
                    );
                })}
            </svg>
            <table className="sr-only">
                <caption>{label}</caption>
                <tbody>
                    {data.map((point) => (
                        <tr key={point.label}><th scope="row">{formatLabel(point.label)}</th><td>{point.value}</td></tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}
