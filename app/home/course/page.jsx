'use client'
import Course from "@/app/component/course/course";
import { Suspense } from "react";

export default function Page() {
    return (
        <Suspense fallback={<p>Loading...</p>}>
            <Course />
        </Suspense>
    )
}
