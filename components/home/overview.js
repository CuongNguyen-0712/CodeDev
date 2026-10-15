'use client';

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import { levelMapping } from "@/constants/constants";
import { ErrorReload } from "../ui/error";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuGauge, LuLibrary, LuLogIn, LuStar, LuTrophy, LuUserPen } from "react-icons/lu";

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
            <Skeleton className="h-[72px] w-full rounded-lg lg:w-96" />
        </div>
    );
}

function Stat({ icon: Icon, label, children }) {
    return (
        <div className="flex min-w-0 flex-col gap-1 px-3 py-3 sm:px-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{label}</span>
            </dt>
            <dd className="m-0 truncate text-base font-semibold text-foreground">
                {children}
            </dd>
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

    const currentLevel = (data?.level && levelMapping[data.level])
        ? levelMapping[data.level] : levelMapping['beginner'];

    const starsCount = data?.star ?? data?.stars ?? 0;
    const rank = data?.rank;

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
                    <AvatarFallback className="text-base font-medium">
                        {getInitials(displayName)}
                    </AvatarFallback>
                </Avatar>

                <div className="min-w-0 space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">Welcome back</p>
                    <h1 className="text-3xl font-semibold tracking-tight break-words text-foreground sm:text-4xl">
                        {displayName}
                    </h1>
                    <p className="line-clamp-2 max-w-[60ch] text-sm text-muted-foreground">
                        {data?.bio || "Pick up your courses, check your progress and find something new to learn."}
                    </p>
                    <Button asChild variant="outline" size="sm" className="mt-1">
                        <Link href="/profile">
                            <LuUserPen />
                            Edit profile
                        </Link>
                    </Button>
                </div>
            </div>

            <dl className="m-0 grid w-full shrink-0 grid-cols-3 divide-x rounded-lg border bg-card lg:w-96">
                <Stat icon={LuGauge} label="Level">
                    {currentLevel?.label || 'Beginner'}
                </Stat>
                <Stat icon={LuStar} label="Stars">
                    <span className="font-mono tabular">{starsCount}</span>
                </Stat>
                <Stat icon={LuTrophy} label="Rank">
                    {rank !== null && rank !== undefined ? (
                        <span className="font-mono tabular">#{rank}</span>
                    ) : (
                        <span className="text-sm font-medium text-muted-foreground">Unranked</span>
                    )}
                </Stat>
            </dl>
        </header>
    );
}
