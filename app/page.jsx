'use client'
import HomePage from "./component/homepage/homepage"
import { Suspense } from "react"

import { LoadingRedirect } from "./component/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomePage />
        </Suspense>
    )
}