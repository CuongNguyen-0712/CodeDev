import { Suspense } from "react";

import HomeLayout from "../layout/homeLayout";
import CoursePage from "@/app/component/course/coursePage";

import { LoadingRedirect } from "@/app/component/ui/loading";

export async function generateMetadata() {
    return {
        title: "Course | CodeDev",
        description: "Discover courses to enhance your skills",
    }
}

export default async function Page() {
    return (
        <Suspense fallback={<LoadingRedirect />}>
            <HomeLayout>
                <CoursePage />
            </HomeLayout>
        </Suspense>
    )
}
