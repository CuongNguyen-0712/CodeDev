'use client';

import { useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "@/components/shadcn/button";
import { Calendar } from "@/components/shadcn/calendar";
import { Input } from "@/components/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";

import { LuCalendar } from "react-icons/lu";

const pad = (n) => String(n).padStart(2, "0");
const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Values are the strings a native input gives, read as local time: "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm".
export function parseLocal(value) {
    if (!value) return null;
    const [day, time = "00:00"] = value.split("T");
    const [y, m, d] = day.split("-").map(Number);
    const [h, min] = time.split(":").map(Number);
    const date = new Date(y, m - 1, d, h, min);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function toLocalValue(date, withTime) {
    return withTime ? `${dayKey(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}` : dayKey(date);
}

const LABEL = { day: "numeric", month: "short", year: "numeric" };
const LABEL_TIME = { ...LABEL, hour: "2-digit", minute: "2-digit" };

/**
 * Date (or date and time) picker for admin forms: a button that shows the chosen value and opens a
 * month grid, quick presets ("In 7 days") and, with `withTime`, a time field. It takes and gives the
 * same strings as the native inputs it replaces, so callers keep their validation.
 */
export function DateField({ id, value, onChange, withTime = false, min, presets = [], placeholder = "Pick a date", clearable = false, invalid, describedBy, className }) {
    const [open, setOpen] = useState(false);
    const selected = parseLocal(value);
    const minDate = parseLocal(min);

    const commit = (date) => {
        const next = minDate && date < minDate ? minDate : date;
        onChange(toLocalValue(next, withTime));
    };

    // A picked day keeps the chosen time (or min's time on min's day, else 09:00).
    const pickDay = (day) => {
        if (!day) return;
        const date = new Date(day);
        const time = selected
            ? [selected.getHours(), selected.getMinutes()]
            : minDate && dayKey(minDate) === dayKey(day) ? [minDate.getHours(), minDate.getMinutes()] : [9, 0];
        date.setHours(withTime ? time[0] : 0, withTime ? time[1] : 0, 0, 0);
        commit(date);
        if (!withTime) setOpen(false);
    };

    const pickPreset = (days) => {
        const date = new Date();
        date.setTime(date.getTime() + days * 86_400_000);
        // Rounded up to the next 5 minutes so the value reads cleanly.
        date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0);
        commit(date);
        if (!withTime) setOpen(false);
    };

    const setTime = (time) => {
        const [h, m] = time.split(":").map(Number);
        if (Number.isNaN(h) || Number.isNaN(m)) return;
        const date = new Date(selected || minDate || new Date());
        date.setHours(h, m, 0, 0);
        commit(date);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    aria-invalid={invalid || undefined}
                    aria-describedby={describedBy}
                    className={cn("w-full min-w-0 justify-start font-normal aria-invalid:border-destructive", !selected && "text-muted-foreground", className)}
                >
                    <LuCalendar aria-hidden="true" />
                    <span className="truncate tabular">
                        {selected ? selected.toLocaleString("en-GB", withTime ? LABEL_TIME : LABEL) : placeholder}
                    </span>
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto max-w-[calc(100vw-2rem)] p-3">
                {presets.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Quick picks">
                        {presets.map((preset) => (
                            <Button key={preset.label} type="button" variant="outline" size="sm" className="h-7 px-2.5 text-xs" onClick={() => pickPreset(preset.days)}>
                                {preset.label}
                            </Button>
                        ))}
                    </div>
                )}
                <Calendar
                    mode="single"
                    selected={selected || undefined}
                    defaultMonth={selected || minDate || undefined}
                    onSelect={pickDay}
                    disabled={minDate ? { before: minDate } : undefined}
                />
                {(withTime || clearable) && (
                    <div className="mt-3 flex items-center gap-2 border-t pt-3">
                        {withTime && (
                            <>
                                <label htmlFor={`${id}-time`} className="text-xs text-muted-foreground">Time</label>
                                <Input
                                    id={`${id}-time`}
                                    type="time"
                                    step={300}
                                    value={selected ? `${pad(selected.getHours())}:${pad(selected.getMinutes())}` : ""}
                                    onChange={(event) => setTime(event.target.value)}
                                    className="h-8 w-28 tabular"
                                />
                            </>
                        )}
                        <span className="flex-1" />
                        {clearable && selected && (
                            <Button type="button" variant="ghost" size="sm" onClick={() => { onChange(""); setOpen(false); }}>Clear</Button>
                        )}
                        {withTime && (
                            <Button type="button" size="sm" onClick={() => setOpen(false)}>Done</Button>
                        )}
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
