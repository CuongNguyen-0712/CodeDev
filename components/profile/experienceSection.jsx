'use client';
import { useInfiniteQuery } from "@tanstack/react-query";
import { LuBookOpen, LuFlag, LuLoaderCircle, LuPuzzle, LuSlidersHorizontal, LuTrophy } from "react-icons/lu";

import { userQueries } from "@/queries/user.query";
import { formatDate } from "@/components/commerce/format";
import HintUsageCard from "@/components/profile/hintUsageCard";
import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

const SOURCES = {
    lesson: { icon: LuBookOpen, label: "Lesson completed" },
    challenge: { icon: LuPuzzle, label: "Challenge passed" },
    course: { icon: LuFlag, label: "Course completed" },
    achievement: { icon: LuTrophy, label: "Achievement unlocked" },
    adjustment: { icon: LuSlidersHorizontal, label: "Adjustment" },
};

/** Earned achievements first-class, the rest with their progress (graded automatically). */
function AchievementsCard({ achievements }) {
    if (!achievements?.length) return null;
    const earned = achievements.filter((a) => a.earnedAt).length;

    return (
        <div className="flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:col-span-3">
            <div className="flex items-center justify-between border-b px-4 py-3">
                <h2 id="achievements-heading" className="text-sm font-semibold text-foreground">Achievements</h2>
                <span className="text-xs text-muted-foreground tabular">{earned}/{achievements.length} unlocked</span>
            </div>
            <ul aria-labelledby="achievements-heading" className="grid gap-px bg-border sm:grid-cols-2">
                {achievements.map((a) => (
                    <li key={a.code} className="flex items-start gap-3 bg-card px-4 py-3">
                        <span
                            className={cn(
                                "flex size-8 shrink-0 items-center justify-center rounded-lg",
                                a.earnedAt ? "bg-xp-soft text-xp" : "bg-muted text-muted-foreground"
                            )}
                        >
                            <LuTrophy className="size-4" aria-hidden="true" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                            <p className="flex items-baseline justify-between gap-2 text-sm font-medium text-foreground">
                                <span className="truncate">{a.title}</span>
                                {a.exp > 0 && <span className="shrink-0 text-xs tabular text-xp">+{a.exp} EXP</span>}
                            </p>
                            <p className="text-xs text-muted-foreground">{a.description}</p>
                            {a.earnedAt ? (
                                <p className="text-xs text-muted-foreground">Unlocked {formatDate(a.earnedAt)}</p>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Progress
                                        value={(a.progress / a.threshold) * 100}
                                        className="h-1.5 flex-1 bg-muted"
                                        aria-label={`${a.title}: ${a.progress} of ${a.threshold}`}
                                    />
                                    <span className="text-xs tabular text-muted-foreground">{a.progress}/{a.threshold}</span>
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** EXP history (newest first, paged) and the level table with the learner's level highlighted. */
export default function ExperienceSection({ status, currentLevel = 1 }) {
    const query = useInfiniteQuery(userQueries.experience(status));
    const pages = query.data?.pages ?? [];
    const levels = pages[0]?.levels ?? [];
    const transactions = pages.flatMap((page) => page?.transactions || []);

    return (
        <section aria-labelledby="experience-heading" className="grid items-start gap-6 lg:grid-cols-3">
            <AchievementsCard achievements={pages[0]?.achievements} />
            <HintUsageCard usage={pages[0]?.hintUsage} />
            <div className="flex min-w-0 flex-col rounded-xl border bg-card lg:col-span-2">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 id="experience-heading" className="text-sm font-semibold text-foreground">EXP history</h2>
                    {!query.isLoading && transactions.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular">
                            {transactions.length} event{transactions.length === 1 ? '' : 's'}
                        </span>
                    )}
                </div>
                {query.isLoading ? (
                    <div className="grid gap-3 p-4">
                        {[0, 1, 2].map((i) => (
                            <div key={i} className="flex items-center gap-3">
                                <Skeleton className="size-8 shrink-0 rounded-lg" />
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <Skeleton className="h-4 w-3/4 max-w-sm" />
                                    <Skeleton className="h-3 w-1/3 max-w-xs" />
                                </div>
                                <Skeleton className="h-4 w-14 shrink-0" />
                            </div>
                        ))}
                    </div>
                ) : query.isError && transactions.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                        Could not load your EXP history.{" "}
                        <Button variant="link" size="xs" onClick={() => query.refetch()}>Try again</Button>
                    </p>
                ) : transactions.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                        Complete a lesson or pass a challenge to earn your first EXP.
                    </p>
                ) : (
                    <ul className="divide-y">
                        {transactions.map((tx) => {
                            const source = SOURCES[tx.source] || SOURCES.adjustment;
                            const Icon = source.icon;
                            return (
                                <li key={tx.id} className="flex items-center gap-3 px-3.5 py-3 sm:px-4">
                                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                        <Icon className="size-4" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <p className="truncate text-sm font-medium text-foreground">
                                            {tx.sourceTitle || tx.reason || source.label}
                                        </p>
                                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                                            <span>{source.label}</span>
                                            <span aria-hidden="true">·</span>
                                            <span>{formatDate(tx.createdAt)}</span>
                                        </p>
                                    </div>
                                    <span
                                        className={cn(
                                            "shrink-0 text-sm font-semibold tabular ml-2",
                                            tx.amount > 0 ? "text-xp" : "text-destructive"
                                        )}
                                    >
                                        {tx.amount > 0 ? "+" : ""}{tx.amount} EXP
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                )}
                {query.hasNextPage && (
                    <div className="flex justify-center border-t py-3">
                        <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                            {query.isFetchingNextPage && <LuLoaderCircle className="animate-spin" aria-hidden="true" />}
                            {query.isFetchingNextPage ? "Loading..." : "Load more"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex min-w-0 flex-col rounded-xl border bg-card lg:col-span-1">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 id="levels-heading" className="text-sm font-semibold text-foreground">Levels</h2>
                    {levels.length > 0 && (
                        <span className="text-xs text-muted-foreground tabular">
                            {levels.length} levels
                        </span>
                    )}
                </div>
                <div className="flex items-center justify-between border-b bg-muted/40 px-3.5 py-1.5 tabular text-[11px] text-muted-foreground sm:px-4">
                    <span>Level & Title</span>
                    <span>Min EXP</span>
                </div>
                {levels.length === 0 ? (
                    <div className="grid gap-2 p-4">
                        {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-6 w-full rounded-md" />)}
                    </div>
                ) : (
                    // Scrolls on its own, so keyboard users must be able to focus it to scroll.
                    <ol
                        className="max-h-96 sm:max-h-[30rem] overflow-y-auto divide-y divide-border/40 py-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        tabIndex={0}
                        aria-label="Levels and the EXP each one needs"
                    >
                        {levels.map((lvl) => {
                            const isCurrent = lvl.level === currentLevel;
                            return (
                                <li
                                    key={lvl.level}
                                    aria-current={isCurrent ? "step" : undefined}
                                    className={cn(
                                        "flex items-center justify-between gap-2 px-3.5 py-2 text-sm transition-colors sm:px-4",
                                        isCurrent
                                            ? "bg-xp-soft font-semibold text-xp"
                                            : "hover:bg-muted/40 text-foreground",
                                        lvl.level < currentLevel && "text-muted-foreground"
                                    )}
                                >
                                    <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                                        <span className="text-xs font-bold tabular shrink-0">
                                            Lv {lvl.level}
                                        </span>
                                        <span className="truncate text-xs sm:text-sm">
                                            {lvl.title}
                                        </span>
                                    </div>
                                    <span className="text-xs tabular shrink-0 font-medium ml-2">
                                        {lvl.minExp.toLocaleString()} <span className="text-[10px] opacity-70">EXP</span>
                                    </span>
                                </li>
                            );
                        })}
                    </ol>
                )}
            </div>
        </section>
    );
}
