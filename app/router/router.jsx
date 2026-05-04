"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from 'react';

export function useRouterActions() {
    const router = useRouter();

    return {
        navigateToCurrent: () => router.push("/"),
        navigateToHome: () => router.push("/home"),
        navigateToAuth: () => router.push("/auth"),
        navigateToSocial: () => router.push("/social"),
        navigateToCourse: (param) => router.push(`/course/${param ?? ''}`),
        navigateToProject: (param) => router.push(`/project/${param ?? ''}`),
        navigateToLearning: (param) => router.push(`/learning/${param ?? ''}`),
        navigateToEvent: () => router.push("/event"),
        navigateReplace: (path) => router.replace(path),
        navigateToTask: (param) => router.push(`/task/${param ?? ''}`),
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
