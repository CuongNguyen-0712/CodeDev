'use client'
import Link from "next/link";

import { ErrorReload } from "../../ui/error";

import { CourseContent, CourseMobileBar, CoursePageFrame } from "./courseContent";

import { useCourseDetails } from "@/hooks/useCourseDetails";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { LuLibrary, LuSearchX } from "react-icons/lu";

function HeaderSkeleton() {
    return (
        <div className="space-y-5" aria-hidden="true">
            <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-md" />
                <Skeleton className="h-3 w-40" />
            </div>
            <div className="space-y-3">
                <Skeleton className="h-9 w-3/4" />
                <Skeleton className="h-4 w-full max-w-xl" />
                <Skeleton className="h-4 w-2/3 max-w-md" />
            </div>
            <div className="flex gap-1.5">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="h-5 w-12" />
            </div>
            <div className="flex gap-2">
                <Skeleton className="h-9 w-40" />
                <Skeleton className="h-9 w-28" />
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="space-y-2 pt-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    );
}

/**
 * Client fallback of the course page, used when the server has no public copy to render: a course
 * that is not published (still open to the learners who own it, decided by the API with their
 * session) or a failed lookup. Published courses are rendered on the server (app/course/[id]).
 */
export default function PreviewPage({ params } = {}) {
    const { data, isLoading, error, refetch } = useCourseDetails(params.id);

    return (
        <CoursePageFrame
            title={data?.title}
            loading={isLoading}
            mobileBar={data ? <CourseMobileBar course={data} courseId={params.id} /> : null}
        >
            {isLoading ? (
                <HeaderSkeleton />
            ) : error ? (
                <ErrorReload
                    data={error || { status: 500, message: "An unexpected error occurred, try again later" }}
                    refetch={() => refetch()}
                />
            ) : !data ? (
                <Empty className="border">
                    <EmptyHeader>
                        <EmptyMedia variant="icon">
                            <LuSearchX aria-hidden="true" />
                        </EmptyMedia>
                        <EmptyTitle>
                            <h1 className="text-lg font-semibold tracking-tight">Course not found</h1>
                        </EmptyTitle>
                        <EmptyDescription className="max-w-[48ch]">
                            This course may have been removed or hidden. Pick another one from the catalog.
                        </EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>
                        <Button asChild size="sm">
                            <Link href="/course"><LuLibrary />Browse courses</Link>
                        </Button>
                    </EmptyContent>
                </Empty>
            ) : (
                <CourseContent course={data} courseId={params.id} />
            )}
        </CoursePageFrame>
    );
}
