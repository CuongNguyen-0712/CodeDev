'use client'
import HomePage from "./component/homepage/homepage"
import { Suspense } from "react"

import { LoadingContent } from "./component/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingContent />}>
            <HomePage />
        </Suspense>
    )
}