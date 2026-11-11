'use client'

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { courseQueries } from "@/queries/course.query";
import { useCourseRate } from "@/mutations/course.mutation";
import { useApp } from "@/contexts/appContext";
import { ErrorReload } from "@/components/ui/error";
import { MILESTONE_LABEL } from "@/lib/ratingRules";
import { RatingStars } from "../ratingStars";

import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLoaderCircle, LuLogIn, LuStar } from "react-icons/lu";

const REASON_TEXT = {
    enroll: () => "Enrol in this course to rate it.",
    progress: () => "Rate this course when you reach 20%.",
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

// "At 20%: 4.1 · At 50%: 4.3 · Finished: 4.6", only milestones with enough ratings for an average.
function Breakdown({ breakdown = [] }) {
    const shown = breakdown.filter((entry) => entry.average != null);
    if (shown.length === 0) return null;
    return (
        <p className="text-xs text-muted-foreground tabular">
            {shown.map((entry) => `${MILESTONE_LABEL[entry.milestone]}: ${entry.average.toFixed(1)}`).join(' · ')}
        </p>
    );
}

// The open milestone's vote: stars only select, Submit casts the one vote. Keyed by milestone, so the
// choice starts empty at each new milestone.
function VoteForm({ pending, onSubmit }) {
    const [picked, setPicked] = useState(0);
    return (
        <>
            <RatingStars value={picked} onChange={setPicked} disabled={pending} />
            <Button type="button" size="sm" onClick={() => onSubmit(picked)} disabled={!picked || pending}>
                {pending && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                {pending ? "Submitting…" : "Submit rating"}
            </Button>
        </>
    );
}

/** The course average and the learner's own votes, kept apart from the discussion. */
export default function RatingSection({ courseId }) {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const { data, isLoading, isError, error, refetch } = useQuery(courseQueries.rating(courseId, status));
    const rate = useCourseRate();
    // Only for screen readers: the visible row already shows the vote.
    const [announcement, setAnnouncement] = useState('');

    // Cast optimistically: the milestone closes at once and reopens if the vote fails.
    const submit = (stars) => {
        setAnnouncement('');
        rate.mutate({ courseId, stars }, {
            onSuccess: () => setAnnouncement('Rating submitted'),
            onError: (error) => alert(error?.status || 500, error?.message || "Could not save your rating. Please try again."),
        });
    };

    const count = Number(data?.count) || 0;
    const latest = data?.history?.at(-1)?.stars;

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
                        <div className="flex flex-col gap-0.5">
                            <Average average={data.average} count={count} />
                            <Breakdown breakdown={data.breakdown} />
                        </div>

                        {data.reason === 'signin' ? (
                            <Button asChild variant="outline" size="sm" className="self-start sm:self-auto">
                                <Link href="/auth"><LuLogIn />Sign in to rate</Link>
                            </Button>
                        ) : data.reason === 'enroll' || data.reason === 'progress' ? (
                            <p className="text-sm text-muted-foreground">{REASON_TEXT[data.reason]()}</p>
                        ) : (
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:shrink-0">
                                <span className="text-xs text-muted-foreground">Your rating</span>
                                {data.milestone ? (
                                    <VoteForm key={data.milestone} pending={rate.isPending} onSubmit={submit} />
                                ) : (
                                    // Votes are final: only the latest one is shown, never editable.
                                    <span className="flex items-center gap-1 text-sm font-medium text-foreground tabular" title={`${latest} out of 5`}>
                                        <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                                        {latest}
                                        <span className="sr-only">out of 5</span>
                                    </span>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
            <span className="sr-only" aria-live="polite">{announcement}</span>
        </section>
    );
}
