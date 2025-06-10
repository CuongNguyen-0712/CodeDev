'use client'
import Project from "@/app/component/project/project";
import { Suspense } from "react";

import { LoadingContent } from "@/app/component/ui/loading";

export default function Page() {
    return (
        <Suspense fallback={<LoadingContent />}>
            <Project />
        </Suspense>
    )
}

