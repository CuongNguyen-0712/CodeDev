'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { BOARDS, BOARD_LABELS, SCORE_UNITS } from "@/lib/ranking";

import { RankBadge, RankProgress } from "@/components/ui/level";
import { ErrorReload } from "@/components/ui/error";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuArrowRight } from "react-icons/lu";

export const OVERALL_FORMULA =
    "Overall score = EXP + half of the points you earned, adjusted by up to ±10% for first-try accuracy once you pass 10 challenges.";

/** Tier, position and progress on each board. `ranks`: { overall, exp, points } standings. */
export function RankSummary({ ranks, headingId = "ranks-heading", title = "Ranks", own = false, action = null }) {
    return (
        <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
            <div className="flex min-h-8 items-center justify-between gap-3">
                <h2 id={headingId} className="text-base font-semibold text-foreground">{title}</h2>
                {action}
            </div>
            <ul className="m-0 grid list-none gap-px overflow-hidden rounded-lg border bg-border p-0 sm:grid-cols-3">
                {BOARDS.map((board) => {
                    const standing = ranks?.[board];
                    return (
                        <li key={board} className="flex min-w-0 flex-col gap-2 bg-card px-4 py-3">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium text-muted-foreground">{BOARD_LABELS[board]}</span>
                                <span className="font-mono text-sm font-semibold tabular">
                                    {standing?.position ? `#${standing.position.toLocaleString()}` : (
                                        <span className="text-xs font-medium text-muted-foreground">Not ranked yet</span>
                                    )}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <RankBadge tier={standing?.tier} title={standing?.title} />
                                <span className="font-mono text-xs text-muted-foreground tabular">
                                    {(standing?.allTimeScore || 0).toLocaleString()} {SCORE_UNITS[board]}
                                </span>
                            </div>
                            {own ? <RankProgress standing={standing} unit={SCORE_UNITS[board]} /> : null}
                        </li>
                    );
                })}
            </ul>
            {own ? <p className="text-xs text-muted-foreground">{OVERALL_FORMULA}</p> : null}
        </section>
    );
}

/** The signed-in learner's ranks (own profile). */
export function MyRankSummary() {
    const { status } = useSession();
    const { data, isLoading, isError, error, refetch } = useQuery(userQueries.ranks(status));

    if (isLoading) {
        return (
            <div className="space-y-3" aria-busy="true" aria-label="Loading ranks">
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-28 w-full rounded-lg" />
            </div>
        );
    }
    if (isError) return <ErrorReload data={error} refetch={refetch} compact title="Could not load your ranks" />;

    return (
        <RankSummary
            ranks={data}
            headingId="profile-ranks-heading"
            own
            action={(
                <Button asChild variant="link" size="sm" className="h-auto px-0">
                    <Link href="/ranking">Leaderboard<LuArrowRight /></Link>
                </Button>
            )}
        />
    );
}
