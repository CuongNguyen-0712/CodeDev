'use client';

import { DateField } from "@/components/admin/ui/dateField";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A "YYYY-MM-DD" from the URL, or "" when it is anything else. */
export const urlDay = (value) => (DAY.test(value || "") ? value : "");

/**
 * From / to days for a list filter, each clearable; `onChange` gets `{ [fromKey]: value }` or
 * `{ [toKey]: value }`. Each button reads its date (or "From" / "To") and is described by `label`.
 */
export default function DateRange({ id, label, from, to, fromKey = "from", toKey = "to", onChange }) {
    return (
        <div className="flex items-center gap-1.5" role="group" aria-labelledby={`${id}-label`}>
            <span id={`${id}-label`} className="sr-only">{label}</span>
            <div className="w-36">
                <DateField id={`${id}-from`} value={from} onChange={(value) => onChange({ [fromKey]: value })} clearable placeholder="From" describedBy={`${id}-label`} />
            </div>
            <span aria-hidden="true" className="text-muted-foreground">–</span>
            <div className="w-36">
                <DateField id={`${id}-to`} value={to} min={from || undefined} onChange={(value) => onChange({ [toKey]: value })} clearable placeholder="To" describedBy={`${id}-label`} />
            </div>
        </div>
    );
}
