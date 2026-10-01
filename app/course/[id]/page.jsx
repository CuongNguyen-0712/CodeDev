import { Suspense } from "react"

import PreviewPage from "@/components/course/params/previewPage"

import { courseService } from "@/services/course.service"
import { courseQueries } from "@/queries/course.query"

import DefaultLayout from "@/components/layouts/defaultLayout";

import { LoadingRedirect } from "@/components/ui/loading";

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

export async function generateMetadata({ params }) {
    const { id } = await params;

    const course = await courseService.getDetails({ courseId: id });

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
    const data = await courseService.getDetails(id);

    queryClient.setQueryData(courseQueries.details(id).queryKey, data);

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