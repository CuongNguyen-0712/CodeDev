'use client'
import Home from "../component/home/home"
import { Suspense } from "react"

import { LoadingContent } from "../component/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingContent />}>
            <Home />
        </Suspense>
    )
}