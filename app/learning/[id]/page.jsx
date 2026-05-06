import CoursePage from "@/app/component/learning/[id]/coursePage";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import DefaultLayout from "@/app/layout/defaultLayout";

import GetStateCourseService from "@/app/services/getService/stateCourseService";

export async function generateMetadata({ params }) {
    const { id: course_id } = await params

    const payload = await GetStateCourseService(course_id)

    if (payload) {
        const data = payload[0]
        return {
            title: `${data.title ?? 'Missing course'} | Learning`,
            description: `${data.description || 'Sorry, something is error !'}`
        }
    }
}

export default async function Page({ params }) {
    const { id: course_id } = await params
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <CoursePage params={{ course_id: course_id }} />
            </DefaultLayout>
        </Suspense>
    )
}