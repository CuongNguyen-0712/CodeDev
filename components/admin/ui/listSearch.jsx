import { Input } from "@/components/shadcn/input";

import { LuSearch } from "react-icons/lu";

/** Case-insensitive match of a query against a row's text fields. */
export const matches = (query, ...fields) => {
    const needle = query.trim().toLowerCase();
    return !needle || fields.some((field) => String(field ?? "").toLowerCase().includes(needle));
};

/** A search field above a list, with how many rows it shows (announced politely). */
export default function ListSearch({ value, onChange, label, shown, total, noun = "rows" }) {
    return (
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <div className="relative w-full max-w-sm">
                <LuSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder={label} aria-label={label} className="pl-8" />
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
                {value.trim() ? `${shown} of ${total} ${noun}` : `${total} ${noun}`}
            </p>
        </div>
    );
}
