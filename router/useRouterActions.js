"use client";
import { useRouter } from "next/navigation";

export function useRouterActions() {
    const router = useRouter();

    return {
        navigate: ({ path, query = {} }) => {
            const searchParams = new URLSearchParams(query);
            const queryString = searchParams.toString();
            const formattedPath = path.startsWith('/') ? path : `/${path}`;
            router.push(queryString ? `${formattedPath}?${queryString}` : formattedPath);
        },
        navigateReplace: (path) => router.replace(path),
        navigateBack: (fallback = "/home") => {
            const fallbackPath = typeof fallback === "string" ? fallback : "/home";

            if (typeof window !== "undefined" && window.history.length <= 1) {
                router.replace(fallbackPath);
                return;
            }

            router.back();
        },
        refresh: () => router.refresh(),
    };
}
