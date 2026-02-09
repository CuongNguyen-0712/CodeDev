import CoursePage from "@/app/component/learning/[id]/coursePage";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

import { getStateCourse } from "@/app/actions/get/action";

export async function generateMetadata({ params }) {
    const { id: course_id } = await params

    const payload = await getStateCourse({ course_id }).then(res => res.json())

    if (payload) {
        return {
            title: `${payload.data?.title ?? 'Missing course'} | Learning`,
            description: `${payload.data?.description || 'Sorry, something is error !'}`
        }
    }
}

export default async function Page({ params }) {
    const { id: course_id } = await params
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <CoursePage params={{ course_id: course_id }} />
        </Suspense>
    )
}