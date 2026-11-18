import { Suspense } from "react";

import DefaultLayout from "@/components/layouts/defaultLayout";

import StydyingPage, { WorkspaceSkeleton } from "@/components/learning/[id]/studyingPage";

import { courseService } from "@/services/course.service";

// The lesson workspace is per learner and per request.
export const instant = false;

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
    const { id } = await params;

    return (
        <DefaultLayout enter={false}>
            <Suspense fallback={<WorkspaceSkeleton />}>
                <StydyingPage
                    params={{ id }}
                />
            </Suspense>
        </DefaultLayout>
    );
}