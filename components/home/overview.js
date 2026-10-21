'use client';

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import { ExpProgress, RankBadge, levelProgress } from "@/components/ui/level";
import { ErrorReload } from "../ui/error";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

import { LuChevronRight, LuCoins, LuLibrary, LuLogIn, LuSparkles, LuTrophy, LuUserPen } from "react-icons/lu";

function getInitials(name) {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'U';
}

function OverviewSkeleton() {
    return (
        <div
            className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between"
            aria-busy="true"
            aria-label="Loading your profile"
        >
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
    );
}

function OverallRank({ status }) {
    const { data } = useQuery(userQueries.ranks(status));
    const overall = data?.overall;

    return (
        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex min-w-0 items-center gap-2">
                <span className="shrink-0">Overall rank</span>
                {overall ? <RankBadge tier={overall.tier} title={overall.title} /> : null}
                {overall?.position ? <span className="font-semibold text-foreground tabular">#{overall.position.toLocaleString()}</span> : null}
            </span>
            <Link href="/ranking" className="ml-2 shrink-0 font-medium text-primary-ink hover:underline">
                Leaderboard
            </Link>
        </div>
    );
}

export default function HomeOverview() {
    const { status } = useSession();

    const isAuthenticated = status === 'authenticated';
    const isSessionLoading = status === 'loading';

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.me(status));

    const showLoading = isSessionLoading || (isAuthenticated && isLoading);

    const displayName = data?.name || data?.username || 'User';

    const progress = levelProgress(data);

    if (showLoading) {
        return <OverviewSkeleton />;
    }

    if (isError) {
        return (
            <ErrorReload
                data={error || { status: 500, message: "Could not load user profile" }}
                refetch={refetch}
            />
        );
    }

    if (!isAuthenticated) {
        return (
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        Welcome to CodeDev
                    </h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Follow programming roadmaps, take interactive courses and practise with coding challenges.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button asChild>
                        <Link href="/auth">
                            <LuLogIn />
                            Sign in
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href="/course">
                            <LuLibrary />
                            Browse courses
                        </Link>
                    </Button>
                </div>
            </header>
        );
    }

    return (
        <header className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
                <Avatar className="size-14 border sm:size-16">
                    <AvatarImage src={data?.image || undefined} alt="" className="object-cover" />
                    <AvatarFallback className="bg-primary-soft text-base font-semibold text-primary-soft-foreground">
                        {getInitials(displayName)}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 space-y-1.5 sm:space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
                    <h1 className="text-3xl font-semibold tracking-tight break-words text-foreground sm:text-4xl">
                        {displayName}
                    </h1>
                    <p className="line-clamp-2 max-w-[60ch] text-sm text-muted-foreground">
                        {data?.bio || "Pick up your courses, check your progress and find something new to learn."}
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-1">
                        <Link href="/settings">
                            <LuUserPen />
                            Edit profile
                        </Link>
                    </Button>
                </div>
            </div>

            {/* Level, EXP, and Points Gamified Card */}
            <div className="w-full shrink-0 rounded-lg border border-border bg-card p-4 lg:w-[26rem]">
                {/* Card Top: Level Badge + Rank Title + Ledger link */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-xp-soft text-xp">
                            <LuTrophy className="size-5" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="tabular text-base font-bold text-foreground">
                                    Level {progress.level}
                                </span>
                                {progress.title && (
                                    <span className="truncate rounded-full bg-xp-soft px-2.5 py-0.5 tabular text-xs font-semibold text-xp">
                                        {progress.title}
                                    </span>
                                )}
                            </div>
                            <p className="mt-0.5 tabular text-xs text-muted-foreground">
                                {progress.isMax
                                    ? "Maximum level reached"
                                    : `${progress.toNext.toLocaleString()} EXP to Level ${progress.nextLevel}`}
                            </p>
                        </div>
                    </div>

                    <Link
                        href="/profile"
                        className="flex shrink-0 items-center gap-1 tabular text-xs font-medium text-muted-foreground hover:text-foreground"
                        title="View EXP history and levels"
                    >
                        <span>History</span>
                        <LuChevronRight className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>

                {/* Progress bar: the EXP still needed is already written above, so no second label */}
                <div className="mt-4">
                    <div
                        role="progressbar"
                        aria-label={`Level ${progress.level}: ${progress.percent}% progress`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progress.percent}
                        className="h-2 w-full overflow-hidden rounded-full bg-xp-soft"
                    >
                        <div
                            className="h-full rounded-full bg-xp"
                            style={{ width: `${progress.percent}%` }}
                        />
                    </div>
                </div>

                {/* Metric Chips Grid (2 distinct tokenized cards for EXP & Points) */}
                <div className="mt-4 grid grid-cols-2 gap-3 pt-3 border-t border-border">
                    <div className="rounded-md border border-border bg-muted p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <LuSparkles className="size-3.5 text-primary-ink" aria-hidden="true" />
                            <span>Experience</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-lg font-bold tabular tracking-tight text-foreground">
                                {progress.exp.toLocaleString()}
                            </span>
                            <span className="tabular text-xs font-medium text-muted-foreground">EXP</span>
                        </div>
                    </div>

                    <div className="rounded-md border border-border bg-muted p-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <LuCoins className="size-3.5 text-warning" aria-hidden="true" />
                            <span>Points</span>
                        </div>
                        <div className="mt-1 flex items-baseline gap-1">
                            <span className="text-lg font-bold tabular tracking-tight text-foreground">
                                {(Number(data?.points) || 0).toLocaleString()}
                            </span>
                            <span className="tabular text-xs font-medium text-muted-foreground">pts</span>
                        </div>
                    </div>
                </div>

                {/* Overall rank: tier, position, link to the leaderboard */}
                <OverallRank status={status} />
            </div>
        </header>
    );
}
