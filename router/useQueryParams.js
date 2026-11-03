"use client";
import { useRouter } from 'next/navigation';

export function useQueryParams() {
    const router = useRouter();

    const updateQuery = (updates) => {
        const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
        const params = new URLSearchParams(currentSearch);

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
