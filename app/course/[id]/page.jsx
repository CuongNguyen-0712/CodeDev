import { Suspense } from "react"

import PreviewCourse from "@/app/component/course/params/preview"

import GetStateCourseService from "@/app/services/getService/stateCourseService";

import { LoadingRedirect } from "@/app/component/ui/loading";

export async function generateMetadata({ params }) {
    const { id: course_id } = await params

    const payload = await GetStateCourseService(course_id)

    if (payload) {
        const data = payload[0]
        return {
            title: `${data.title ?? 'Missing course'} | Course`,
            description: `${data.description || 'Sorry, something is error !'}`
        }
    }
}

export default async function Page({ params }) {
    const { id: course_id } = await params

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <PreviewCourse
                params={{ id: course_id }}
            />
        </Suspense>
    )
}