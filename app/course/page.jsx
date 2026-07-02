import { Suspense } from "react";

import HomeLayout from "../layout/homeLayout";
import CourseContent from "../component/course/content";

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
            <HomeLayout>
                <CourseContent />
            </HomeLayout>
        </Suspense>
    )
}
