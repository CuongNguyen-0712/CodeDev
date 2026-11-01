'use client';

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * List filters kept in the query string, so a filtered list can be shared and Back works.
 * `allowed` maps each filter to its accepted values (an array) or a max length (a number);
 * values equal to `defaults` are left out of the URL. Never put an email in a filter.
 */
export function useUrlFilters(allowed, defaults = {}) {
    const searchParams = useSearchParams();
    const router = useRouter();
    const pathname = usePathname();

    const values = {};
    for (const [key, rule] of Object.entries(allowed)) {
        const raw = searchParams.get(key) || "";
        values[key] = Array.isArray(rule) ? (rule.includes(raw) ? raw : defaults[key] ?? "") : raw.slice(0, rule);
    }

    const update = (patch) => {
        const next = new URLSearchParams(searchParams);
        for (const [key, value] of Object.entries(patch)) {
            if (value && value !== defaults[key]) next.set(key, value);
            else next.delete(key);
        }
        router.replace(`${pathname}${next.toString() ? `?${next}` : ""}`, { scroll: false });
    };

    return [values, update];
}
