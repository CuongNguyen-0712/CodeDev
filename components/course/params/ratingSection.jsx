'use client'

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { courseQueries } from "@/queries/course.query";
import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { ErrorReload } from "@/components/ui/error";
import { RatingStars } from "../ratingStars";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLogIn, LuStar } from "react-icons/lu";

const REASON_TEXT = {
    enroll: "Enrol in this course to rate it.",
    lesson: "Complete a lesson of this course to rate it.",
};

function Average({ average, count }) {
    if (!count) return <p className="text-sm text-muted-foreground">No ratings yet</p>;
    if (average == null) return <p className="text-sm text-muted-foreground">Not enough ratings yet to show an average.</p>;
    return (
        <p className="flex items-center gap-1 text-sm font-medium text-foreground tabular" title={`Rated ${average.toFixed(1)} out of 5`}>
            <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
            <span className="sr-only">Rating</span>
            {average.toFixed(1)}
            <span className="sr-only">out of 5</span>
        </p>
    );
}

/** The course average and the learner's own stars, kept apart from the discussion (plan 12). */
export default function RatingSection({ courseId }) {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const { data, isLoading, isError, error, refetch } = useQuery(courseQueries.rating(courseId, status));
    const rate = useCourseRate();
    const [saved, setSaved] = useState(false);

    // Saved optimistically: the stars change at once and roll back if the save fails.
    const save = (stars) => {
        setSaved(false);
        rate.mutate({ courseId, stars }, {
            onSuccess: () => setSaved(true),
            onError: (error) => alert(error?.status || 500, error?.message || "Could not save your rating. Please try again."),
        });
    };

    const count = Number(data?.count) || 0;

    return (
        <section id="ratings" aria-labelledby="course-ratings-heading" className="scroll-mt-16 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <h2 id="course-ratings-heading" className="text-base font-semibold">Ratings</h2>
                {data && count > 0 && (
                    <span className="text-xs text-muted-foreground tabular">
                        {count.toLocaleString('en-US')} {count === 1 ? 'rating' : 'ratings'}
                    </span>
                )}
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-card px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                {isError ? (
                    <ErrorReload data={error} refetch={() => refetch()} />
                ) : isLoading || !data ? (
                    <div className="contents" role="status" aria-label="Loading ratings">
                        <Skeleton className="h-5 w-24" />
                        <Skeleton className="h-7 w-40" />
                    </div>
                ) : (
                    <>
                        <Average average={data.average} count={count} />

                        {data.eligible ? (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Your rating</span>
                                <RatingStars value={data.stars} onChange={save} />
                                <span className="text-xs text-muted-foreground" aria-live="polite">
                                    {saved && !rate.isPending ? 'Saved' : ''}
                                </span>
                            </div>
                        ) : data.reason === 'signin' ? (
                            <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                                <Link href="/auth"><LuLogIn />Sign in to rate</Link>
                            </Button>
                        ) : (
                            <p className="text-sm text-muted-foreground">{REASON_TEXT[data.reason] || REASON_TEXT.lesson}</p>
                        )}
                    </>
                )}
            </div>
        </section>
    );
}
