import { Suspense } from "react"

import PreviewCourse from "@/app/component/course/params/preview"

import { courseService } from "@/app/services/course.service"

import DefaultLayout from "@/app/layout/defaultLayout";

import { LoadingRedirect } from "@/app/component/ui/loading";

import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";

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
    await queryClient.ensureQueryData(courseQueries.details(id));

    return (
        <DefaultLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <HydrationBoundary state={dehydrate(queryClient)}>
                    <PreviewCourse
                        params={{ id }}
                    />
                </HydrationBoundary>
            </Suspense>
        </DefaultLayout>
    )
}