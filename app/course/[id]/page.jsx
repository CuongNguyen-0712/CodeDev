import CoursePage from "@/app/component/course/[id]/coursePage";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

export default async function Page({ params }) {
    const { id: course_id } = await params
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <CoursePage params={{ course_id: course_id }} />
        </Suspense>
    )
}