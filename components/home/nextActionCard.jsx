'use client';

import Link, { useLinkStatus } from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";

import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLibrary, LuLoaderCircle, LuPlay } from "react-icons/lu";

// The learning workspace takes a moment to open: the link's icon spins while the navigation is pending.
function PendingIcon({ icon: Icon }) {
    const { pending } = useLinkStatus();
    return pending ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />;
}

export default function NextActionCard() {
    const { status } = useSession();
    const { data, isLoading } = useQuery(userQueries.overview(status));

    if (status !== 'authenticated') return null;

    if (isLoading) {
        return (
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
        );
    }

    const inProgress = data?.courses?.in_progress || [];
    const enrolled = data?.courses?.enrolled || [];
    const activeCourse = inProgress[0] || enrolled[0];

    if (!activeCourse) {
        return (
            <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1.5">
                        <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                            Pick your first course
                        </h2>
                        <p className="max-w-[50ch] text-sm text-muted-foreground">
                            Choose one from the catalog, or follow a roadmap for the role you want.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        <Button asChild size="default">
                            <Link href="/course">
                                <LuLibrary aria-hidden="true" />
                                Browse courses
                            </Link>
                        </Button>
                        <Button asChild variant="outline" size="default">
                            <Link href="/roadmap">
                                View roadmaps
                            </Link>
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    const total = Number(activeCourse.total || 0);
    const completed = Number(activeCourse.progress || 0);
    const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;
    const isStarted = inProgress.length > 0;

    return (
        <section
            aria-labelledby="next-action-heading"
            className="rounded-xl border border-primary/30 bg-card p-5 transition-colors hover:border-primary/50 sm:p-6 dark:border-primary/45 dark:hover:border-primary/70"
        >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                <div className="min-w-0 flex-1 space-y-3">
                    <div className="space-y-1">
                        <h2 id="next-action-heading" className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                            {activeCourse.title}
                        </h2>
                        <p className="truncate text-sm text-muted-foreground">
                            {[isStarted ? "In progress" : "Not started", activeCourse.language_name, activeCourse.category_name].filter(Boolean).join(' · ')}
                            {total > 0 && `, ${completed} of ${total} lessons passed`}
                        </p>
                    </div>

                    <div className="flex max-w-md items-center gap-3">
                        <Progress value={percent} className="h-2 flex-1" aria-label={`${activeCourse.title} progress`} />
                        <span className="w-10 text-right text-xs font-medium tabular text-muted-foreground">
                            {percent}%
                        </span>
                    </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <Button asChild size="lg" className="w-full sm:w-auto">
                        <Link href={`/learning/${activeCourse.id}`}>
                            <PendingIcon icon={LuPlay} />
                            {isStarted ? "Continue learning" : "Start course"}
                        </Link>
                    </Button>
                    <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
                        <Link href={`/course/${activeCourse.id}`}>
                            Course details
                        </Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}
