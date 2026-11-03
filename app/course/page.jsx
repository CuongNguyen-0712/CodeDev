import { Suspense } from "react";

import HomeLayout from '@/components/layouts/homeLayout';
import CoursePage from "@/components/course/coursePage";

import { PageSkeleton } from "@/components/ui/loading";

export async function generateMetadata() {
    return {
        title: "Course | CodeDev",
        description: "Discover courses to enhance your skills",
    }
}

export default async function Page() {
    return (
        <HomeLayout>
            <Suspense fallback={<PageSkeleton />}>
                <CoursePage />
            </Suspense>
        </HomeLayout>
    )
}
