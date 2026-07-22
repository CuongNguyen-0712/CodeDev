import { Suspense } from "react";

import HomeLayout from "../layout/homeLayout";
import CoursePage from "@/app/component/course/coursePage";

import { LoadingRedirect } from "@/app/component/ui/loading";

import { QueryClient } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";

export async function generateMetadata() {
    return {
        title: "Course | CodeDev",
        description: "Discover courses to enhance your skills",
    }
}

export default async function Page() {
    const queryClient = new QueryClient();

    await queryClient.ensureQueryData(courseQueries.list());

    return (
        <HomeLayout>
            <Suspense fallback={<LoadingRedirect />}>
                <CoursePage />
            </Suspense>
        </HomeLayout>
    )
}
