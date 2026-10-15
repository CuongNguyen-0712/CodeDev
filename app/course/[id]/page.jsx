import { Suspense } from "react"

import PreviewPage from "@/components/course/params/previewPage"

import { courseService } from "@/services/course.service"
import { getAuthSession } from "@/lib/session"
import { courseQueries } from "@/queries/course.query"

import DefaultLayout from "@/components/layouts/defaultLayout";

import { LoadingRedirect } from "@/components/ui/loading";

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

export async function generateMetadata({ params }) {
    const { id } = await params;

    const course = await courseService.getDetails({ courseId: id }).catch(() => null);

    if (!course) {
        return {
            title: "Course not found",
        };
    }

    return {
        title: `${course.title} | Course`,
        description: course.description,
    };
}

export default async function Page({ params }) {
    const { id } = await params

    const queryClient = new QueryClient();

    // Prefetch with the viewer's id so the hydrated data carries their status / progress.
    const session = await getAuthSession();
    const data = await courseService
        .getDetails({ courseId: id, userId: session?.user?.id ?? null })
        .catch((error) => {
            console.error("Failed to prefetch course details:", error);
            return null;
        });

    if (data) {
        queryClient.setQueryData(courseQueries.details(id).queryKey, data);
    }

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <HydrationBoundary state={dehydrate(queryClient)}>
                    <PreviewPage
                        params={{ id }}
                    />
                </HydrationBoundary>
            </DefaultLayout>
        </Suspense>
    )
}