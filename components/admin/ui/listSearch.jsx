'use client';

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/shadcn/input";

import { LuSearch } from "react-icons/lu";

/** Case-insensitive match of a query against a row's text fields. */
export const matches = (query, ...fields) => {
    const needle = query.trim().toLowerCase();
    return !needle || fields.some((field) => String(field ?? "").toLowerCase().includes(needle));
};

/**
 * A search field above a list, with how many rows it shows (announced politely). With `delay` the
 * field types freely and `onChange` runs once typing pauses, as the Users search does for the URL.
 * `children` (filter selects) sit next to the field; without `total` the count is left out.
 */
export default function ListSearch({ value, onChange, label, shown, total, noun = "rows", delay = 0, children }) {
    const [draft, setDraft] = useState(value);
    const sent = useRef(value);

    // A value changed from outside (a tab switch clearing the search) replaces what was typed.
    useEffect(() => {
        if (value !== sent.current) { sent.current = value; setDraft(value); }
    }, [value]);

    useEffect(() => {
        if (draft === sent.current) return undefined;
        const timer = setTimeout(() => { sent.current = draft; onChange(draft); }, delay);
        return () => clearTimeout(timer);
    }, [draft, delay, onChange]);

    return (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="relative w-full max-w-sm">
                <LuSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={label} aria-label={label} maxLength={100} className="pl-8" />
            </div>
            {children}
            {total != null && (
                <p className="text-sm text-muted-foreground" aria-live="polite">
                    {value.trim() || shown !== total ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}
                </p>
            )}
        </div>
    );
}
