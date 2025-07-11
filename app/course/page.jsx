'use client'
import Course from "@/app/component/course/course";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Course />
        </Suspense>
    )
}
