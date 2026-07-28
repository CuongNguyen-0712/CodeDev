import { Suspense } from "react"

import PreviewPage from "@/app/component/course/params/previewPage"

import { courseService } from "@/app/services/course.service"
import { courseQueries } from "@/app/query/course.query"

import DefaultLayout from "@/app/layout/defaultLayout";

import { LoadingRedirect } from "@/app/component/ui/loading";

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";

export async function generateMetadata({ params }) {
    const { id } = await params;

    const data = await courseService.getDetails(id);
    const course = data[0];

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

    queryClient.setQueryData(courseQueries.details(id).queryKey, data[0]);

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