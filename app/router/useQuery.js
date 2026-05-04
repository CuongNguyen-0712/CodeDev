"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function useQuery() {
    const router = useRouter();
    const params = useSearchParams();

    return useCallback((path, query = {}) => {
        const currentParams = new URLSearchParams(params.toString());

        Object.entries(query).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) {
                currentParams.delete(key);
            } else {
                currentParams.set(key, String(value));
            }
        });

        const queryString = currentParams.toString();

        router.push(
            queryString ? `${path}?${queryString}` : path,
            { scroll: false }
        );
    }, [router, params]);
}