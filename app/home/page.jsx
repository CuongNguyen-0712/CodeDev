'use client'
import Home from "../component/home/home"
import { Suspense } from "react"

export default function Page() {
    return (
        <Suspense fallback={null}>
            <Home />
        </Suspense>
    )
}