'use client';

import { useEffect, useRef, useState } from "react";

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
 * Which bars get an x label: every Nth bar so labels at least `minGap` px apart never collide, counted
 * back from the last bar so the newest one (today) is always labelled.
 */
export function pickLabels(count, plotWidth, minGap = 52) {
    if (count <= 0) return new Set();
    const slot = plotWidth / count;
    const step = Math.max(1, Math.ceil(minGap / Math.max(1, slot)));
    const picked = new Set();
    for (let index = count - 1; index >= 0; index -= step) picked.add(index);
    return picked;
}

/**
 * Columns (docs/admin-panel-plan.md 5.6): square corners, one hue per series, 3-5 faint gridlines, round
 * ticks, and the numbers in a table for screen readers. Drawn at the container's real pixel width, so
 * the text stays 11 px at every size. A readout above names the peak, or the bar under the pointer or
 * picked with the arrow keys.
 *
 * data: [{ label, value, parts? }]. parts: { [series.key]: number } when `series` stacks the bar.
 * compare: optional values of the period before, same length, drawn as an outline behind each bar.
 * unit: what one bar is, for the screen-reader hint ("days", "weeks").
 */
export default function BarChart({ data, label, height = 180, className, formatLabel = (value) => value, compare, compareLabel = "the period before", series, unit = "bars" }) {
    const ref = useRef(null);
    const [width, setWidth] = useState(640);
    const [active, setActive] = useState(null);

    useEffect(() => {
        const node = ref.current;
        if (!node || typeof ResizeObserver === "undefined") return undefined;
        const observer = new ResizeObserver(([entry]) => {
            const next = Math.round(entry.contentRect.width);
            if (next > 0) setWidth(next);
        });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);

    const pad = { top: 8, right: 8, bottom: 22, left: 36 };
    const values = data.map((point) => point.value);
    const max = Math.max(0, ...values, ...(compare || []));
    const ticks = niceTicks(max);
    const top = ticks[ticks.length - 1] || 1;
    const plotW = Math.max(1, width - pad.left - pad.right);
    const plotH = height - pad.top - pad.bottom;
    const slot = plotW / Math.max(1, data.length);
    const barW = Math.max(2, Math.min(48, slot * 0.62));
    const y = (value) => pad.top + plotH - (value / top) * plotH;
    const labelled = pickLabels(data.length, plotW);
    const total = values.reduce((sum, value) => sum + value, 0);
    const peak = values.reduce((best, value, index) => (value > (values[best] ?? -1) ? index : best), 0);
    const shownIndex = active ?? peak;
    const shown = data[shownIndex];
    const move = (event) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (event.key === "Escape") return setActive(null);
        if (!step || !data.length) return;
        event.preventDefault();
        setActive((current) => Math.min(data.length - 1, Math.max(0, (current ?? peak) + step)));
    };

    return (
        <figure ref={ref} className={cn("w-full min-w-0", className)}>
            <figcaption className="mb-1 flex min-h-5 flex-wrap items-baseline gap-x-1.5 text-xs text-muted-foreground" aria-live="polite">
                {shown && (
                    <>
                        <span>{active == null ? "Peak" : formatLabel(shown.label)}</span>
                        <span className="text-sm font-semibold tabular-nums text-foreground">{formatNumber(shown.value)}</span>
                        {active == null && shown.value > 0 && <span>on {formatLabel(shown.label)}</span>}
                        {compare && <span>· {formatNumber(compare[shownIndex] ?? 0)} {compareLabel}</span>}
                        {series && shown.value > 0 && <span>· {series.map((part) => `${formatNumber(shown.parts?.[part.key] || 0)} ${part.label.toLowerCase()}`).join(", ")}</span>}
                    </>
                )}
            </figcaption>
            <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                className="block max-w-full rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                role="img"
                aria-label={`${label}: ${formatNumber(total)} in total. Arrow keys move between ${unit}.`}
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
                    const dim = active != null && active !== index && "opacity-40";
                    const previous = compare?.[index] || 0;
                    let base = pad.top + plotH;
                    return (
                        <g key={point.label} onMouseEnter={() => setActive(index)}>
                            {/* The whole column answers the pointer, so a short bar or a zero day is easy to hit. */}
                            <rect x={pad.left + index * slot} y={pad.top} width={slot} height={plotH} className="fill-transparent" />
                            {previous > 0 && (
                                <rect x={x + 0.5} y={y(previous)} width={barW - 1} height={pad.top + plotH - y(previous)} className={cn("fill-none stroke-muted-foreground/45", dim)} strokeDasharray="3 2" />
                            )}
                            {series
                                ? series.map((part) => {
                                    const value = point.parts?.[part.key] || 0;
                                    if (value <= 0) return null;
                                    const h = (value / top) * plotH;
                                    base -= h;
                                    return <rect key={part.key} x={x} y={base} width={barW} height={h} className={cn(part.className, "transition-opacity", dim)} data-bar style={{ "--i": index }} />;
                                })
                                : point.value > 0 && (
                                    <rect x={x} y={y(point.value)} width={barW} height={pad.top + plotH - y(point.value)} className={cn("fill-primary-ink transition-opacity", dim)} data-bar style={{ "--i": index }}>
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
            {(series || compare) && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden="true">
                    {(series || [{ key: "value", label: "This period", className: "fill-primary-ink" }]).map((part) => (
                        <li key={part.key} className="flex items-center gap-1.5">
                            <svg viewBox="0 0 8 8" className="size-2"><rect width="8" height="8" className={part.className} /></svg>{part.label}
                        </li>
                    ))}
                    {compare && <li className="flex items-center gap-1.5"><span className="size-2 border border-dashed border-muted-foreground/60" />{compareLabel[0].toUpperCase() + compareLabel.slice(1)}</li>}
                </ul>
            )}
            <table className="sr-only">
                <caption>{label}</caption>
                <thead>
                    <tr>
                        <th scope="col">{unit}</th>
                        <th scope="col">Total</th>
                        {series?.map((part) => <th key={part.key} scope="col">{part.label}</th>)}
                        {compare && <th scope="col">{compareLabel}</th>}
                    </tr>
                </thead>
                <tbody>
                    {data.map((point, index) => (
                        <tr key={point.label}>
                            <th scope="row">{formatLabel(point.label)}</th>
                            <td>{point.value}</td>
                            {series?.map((part) => <td key={part.key}>{point.parts?.[part.key] || 0}</td>)}
                            {compare && <td>{compare[index] ?? 0}</td>}
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}
