import { Suspense } from "react"

import PreviewCourse from "@/app/component/course/params/preview"

import GetStateCourseService from "@/app/services/getService/stateCourseService";

import DefaultLayout from "@/app/layout/defaultLayout";

import { LoadingRedirect } from "@/app/component/ui/loading";

export async function generateMetadata({ params }) {
    const { id } = await params

    const course_id = id.split('_').slice(-1).at(0)

    const payload = await GetStateCourseService({ courseId: course_id })
    const data = payload[0]

    return {
        title: `${data?.title || 'Missing course'} | Course`,
        description: `${data?.description || 'Sorry, something is error !'}`
    }
}

export default async function Page({ params }) {
    const { id } = await params

    const course_id = id.split('_').slice(-1).at(0)

    return (
        <Suspense fallback={<LoadingRedirect />}>
            <DefaultLayout>
                <PreviewCourse
                    params={{ id: course_id }}
                />
            </DefaultLayout>
        </Suspense>
    )
}