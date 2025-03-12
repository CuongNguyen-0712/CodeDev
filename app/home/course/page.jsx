'use client'
import Course from "@/app/component/course/course";
import { Suspense } from "react";

export default function Page() {
    return (
        <Suspense fallback={null}>
            <Course />
        </Suspense>
    )
}
