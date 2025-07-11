'use client'
import Project from "@/app/component/project/project";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Project />
        </Suspense>
    )
}

