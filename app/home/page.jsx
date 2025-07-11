'use client'
import Home from "../component/home/home"
import { Suspense } from "react"

import { LoadingRedirect } from "../component/ui/loading"

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Home />
        </Suspense>
    )
}