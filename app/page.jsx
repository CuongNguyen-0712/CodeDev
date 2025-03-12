'use client'

import HomePage from "./component/homepage/homepage"
import { Suspense } from "react"

export default function Page() {
    return (
        <Suspense fallback={null}>
            <HomePage />
        </Suspense>
    )
}