"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from 'react';

export function useRouterActions() {
    const router = useRouter();

    return {
        navigateToCurrent: () => router.push("/", { shallow: true }),
        navigateToHome: () => router.push("/home", { shallow: true }),
        navigateToAuth: () => router.push("/auth", { shallow: true }),
        navigateToSocial: () => router.push("/social", { shallow: true }),
        navigateToCourse: (param) => router.push(`/course/${param ?? ''}`, { shallow: true }),
        navigateToProject: (param) => router.push(`/project/${param ?? ''}`, { shallow: true }),
        navigateToLearning: (param) => router.push(`/learning/${param ?? ''}`, { shallow: true }),
        navigateToEvent: () => router.push("/event", { shallow: true }),
        navigateToTask: (param) => router.push(`/task/${param ?? ''}`, { shallow: true }),
        navigateBack: () => router.back(),
        handleRefresh: () => router.refresh(),
    };
}

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
