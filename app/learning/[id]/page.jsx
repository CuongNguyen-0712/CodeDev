import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import DefaultLayout from "@/app/layout/defaultLayout";

import StydyingPage from "@/app/component/learning/[id]/studyingPage";

import { courseService } from "@/app/services/course.service";

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

    return (
        <DefaultLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <StydyingPage
                    params={{ id }}
                />
            </Suspense>
        </DefaultLayout>
    )
}