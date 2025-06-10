"use client";
import { useRouter, useSearchParams } from "next/navigation";

export function useRouterActions() {
    const router = useRouter();

    return {
        navigateToCurrent: () => router.push("/", { shallow: true }),
        navigateToHome: () => router.push("/home", { shallow: true }),
        navigateToAuth: () => router.push("/auth", { shallow: true }),
        navigateToSocial: () => router.push("/social", { shallow: true }),
        navigateToCourse: () => router.push("/course", { shallow: true }),
        navigateToProject: () => router.push("/project", { shallow: true }),
        navigateToEvent: () => router.push("/event", { shallow: true }),
    };
}


export function useQuery() {
    const router = useRouter();
    const params = useSearchParams();

    return (path, query) => {
        const currentParams = new URLSearchParams(params.toString());

        Object.entries(query).forEach(([key, value]) => {
            if (value === null || value === undefined || value === false) {
                currentParams.delete(key);
            } else {
                currentParams.set(key, value);
            }
        });

        router.push(`${path}?${currentParams.toString()}`, { scroll: false });
    };
}

