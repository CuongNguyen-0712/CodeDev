import Course from "@/app/component/course/course";
import { Suspense } from "react";

import { LoadingRedirect } from "@/app/component/ui/loading";

export async function generateMetadata() {
    return {
        title: "Course | CodeDev",
        description: "Discover courses to enhance your skills",
    }
}

export default function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <Course />
        </Suspense>
    )
}
