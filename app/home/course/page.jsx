'use client'
import Course from "@/app/component/course/course";
import { Suspense } from "react";

import { LoadingContent } from "@/app/component/ui/loading";

export default function Page() {
    return (
        <Suspense fallback={<LoadingContent />}>
            <Course />
        </Suspense>
    )
}
