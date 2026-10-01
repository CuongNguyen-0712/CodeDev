import { Suspense } from "react";

import { LoadingRedirect } from "@/components/ui/loading";

import DefaultLayout from "@/components/layouts/defaultLayout";

import StydyingPage from "@/components/learning/[id]/studyingPage";

import { courseService } from "@/services/course.service";

export async function generateMetadata({ params }) {
    const { id } = await params;

    const course = await courseService.getDetails({ courseId: id });

    if (course.rowCount === 0) {
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
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <StydyingPage
                    params={{ id }}
                />
            </DefaultLayout>
        </Suspense>
    )
}