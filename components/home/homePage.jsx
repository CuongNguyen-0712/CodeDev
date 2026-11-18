'use client';
import HomeOverview from "./overview";
import HomeRecommend from "./recommend";
import HomeLearning from "./learning";
import NextActionCard from "./nextActionCard";
import { Skeleton } from "@/components/shadcn/skeleton";

export function HomePageSkeleton() {
    return (
        <div id="overview" className="@container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 lg:gap-8 lg:pt-10 lg:pb-10 [&>*]:![animation:none]">
            {/* Overview Skeleton */}
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between" aria-hidden="true">
                <div className="flex items-start gap-4">
                    <Skeleton className="size-14 shrink-0 rounded-full sm:size-16" />
                    <div className="space-y-2.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-56 max-w-[60vw]" />
                        <Skeleton className="h-4 w-72 max-w-[60vw]" />
                        <Skeleton className="h-8 w-28" />
                    </div>
                </div>
                <Skeleton className="h-[210px] w-full rounded-2xl lg:w-[26rem]" />
            </div>

            {/* NextActionCard Skeleton */}
            <div className="flex w-full flex-col gap-3 rounded-xl border bg-card p-5 sm:p-6" aria-hidden="true">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-6 w-3/5" />
                    <Skeleton className="h-4 w-2/5" />
                </div>
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-10 w-36" />
            </div>

            {/* Bottom Grid Skeleton */}
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden="true">
                {/* HomeLearning panel */}
                <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2.5">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-16" />
                    </div>
                    <div className="divide-y p-0">
                        {Array.from({ length: 3 }, (_, index) => (
                            <div key={index} className="flex flex-col gap-2.5 px-4 py-3">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="size-8 rounded-md" />
                                    <div className="flex-1 space-y-1.5">
                                        <Skeleton className="h-3.5 w-3/4" />
                                        <Skeleton className="h-3 w-1/3" />
                                    </div>
                                </div>
                                <Skeleton className="h-1.5 w-full" />
                            </div>
                        ))}
                    </div>
                </div>

                {/* HomeRecommend panel */}
                <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex min-h-14 items-center justify-between gap-2 border-b px-4 py-2.5">
                        <Skeleton className="h-5 w-36" />
                        <Skeleton className="h-4 w-12" />
                    </div>
                    <div className="p-4 space-y-3">
                        <Skeleton className="h-32 w-full rounded-lg" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function HomePage({ viewerId }) {
    return (
        <div id="overview" className="@container mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-4 pb-8 sm:px-6 sm:pt-6 lg:gap-8 lg:pt-10 lg:pb-10">
            <HomeOverview viewerId={viewerId} />

            <NextActionCard viewerId={viewerId} />

            {/* Progress comes first on small screens; on lg it moves into the right column. */}
            <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start xl:grid-cols-[minmax(0,1fr)_22rem]">
                <HomeLearning viewerId={viewerId} />
                <HomeRecommend viewerId={viewerId} />
            </div>
        </div>
    )
}
