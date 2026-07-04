"use client";
import { useRouter, useSearchParams } from 'next/navigation';

export function useQueryParams() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const updateQuery = (updates) => {
        const params = new URLSearchParams(searchParams);

        Object.entries(updates).forEach(
            ([key, value]) => {
                if (!value) {
                    params.delete(key);
                } else {
                    params.set(key, value);
                }
            }
        );

        router.push(`?${params.toString()}`);
    };

    return updateQuery;
}