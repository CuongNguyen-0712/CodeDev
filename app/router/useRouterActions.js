"use client";
import { useRouter } from "next/navigation";

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