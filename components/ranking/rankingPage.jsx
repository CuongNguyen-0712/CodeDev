'use client';

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { BOARDS, BOARD_LABELS, PERIODS, PERIOD_LABELS, SCORE_UNITS, parseRankingQuery } from "@/lib/ranking";
import { cn } from "@/lib/utils";

import { OVERALL_FORMULA } from "@/components/ranking/rankSummary";
import { RankBadge, RankProgress } from "@/components/ui/level";
import { ErrorReload } from "@/components/ui/error";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";

import { LuBookOpen, LuCrown, LuEyeOff, LuLock, LuMedal, LuSettings } from "react-icons/lu";

const fmt = (value) => (Number(value) || 0).toLocaleString();

function minutesAgo(iso) {
    const time = iso ? Date.parse(iso) : NaN;
    if (Number.isNaN(time)) return null;
    const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
    return minutes < 1 ? "Updated just now" : `Updated ${minutes} min ago`;
}

function nameOf(user) {
    return user?.nickname || user?.username || "Learner";
}

function LearnerAvatar({ user, className }) {
    const name = nameOf(user);
    return (
        <Avatar className={cn("size-8 shrink-0", className)}>
            <AvatarImage src={user?.image || undefined} alt="" className="object-cover" />
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary-soft-foreground">
                {name.charAt(0).toUpperCase()}
            </AvatarFallback>
        </Avatar>
    );
}

/** Name linking to the profile; `stretch` makes the whole (relative) row clickable. */
function LearnerLink({ user, isViewer, stretch = false }) {
    const name = nameOf(user);
    return (
        <Link
            href={`/profile/${encodeURIComponent(user.username)}`}
            className={cn(
                "min-w-0 truncate rounded-sm font-medium text-foreground hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                stretch && "after:absolute after:inset-0 after:content-['']"
            )}
            title={name}
        >
            {name}
            {isViewer ? <span className="ml-1.5 text-xs font-semibold text-primary-ink">(You)</span> : null}
            <span className="sr-only">. View profile</span>
        </Link>
    );
}

const TIER_DOT = { 1: "bg-muted-foreground", 2: "bg-info", 3: "bg-success", 4: "bg-warning", 5: "bg-xp", 6: "bg-primary" };

const PODIUM_ICON = { 1: LuCrown, 2: LuMedal, 3: LuMedal };
const PODIUM_TONE = { 1: "bg-xp-soft text-xp", 2: "bg-muted text-muted-foreground", 3: "bg-warning-soft text-warning" };

function Podium({ entries, board, viewerId }) {
    if (entries.length === 0) return null;
    return (
        <ol className="m-0 grid list-none gap-3 p-0 sm:grid-cols-3 sm:items-end" aria-label="Top 3">
            {entries.map((entry) => {
                const Icon = PODIUM_ICON[entry.position];
                return (
                    <li
                        key={entry.user.id}
                        className={cn(
                            "relative flex items-center gap-3 rounded-lg border bg-card p-4 transition-colors hover:bg-accent/40 sm:flex-col sm:text-center",
                            entry.position === 1 ? "sm:order-2 sm:pb-6" : entry.position === 2 ? "sm:order-1" : "sm:order-3",
                            entry.user.id === viewerId && "border-primary/40 bg-primary-soft/40"
                        )}
                    >
                        <span className={cn("flex size-9 shrink-0 items-center justify-center gap-0.5 rounded-full font-mono text-sm font-semibold", PODIUM_TONE[entry.position])}>
                            <Icon className="size-3.5" aria-hidden="true" />
                            {entry.position}
                        </span>
                        <LearnerAvatar user={entry.user} className={entry.position === 1 ? "sm:size-14" : "sm:size-12"} />
                        <div className="flex min-w-0 flex-1 flex-col gap-1 sm:items-center">
                            <LearnerLink user={entry.user} isViewer={entry.user.id === viewerId} stretch />
                            <RankBadge tier={entry.tier} title={entry.tierTitle} />
                        </div>
                        <span className="font-mono text-sm font-semibold tabular">
                            {fmt(entry.score)} <span className="text-xs font-medium text-muted-foreground">{SCORE_UNITS[board]}</span>
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

function BoardTable({ entries, board, period, viewerId, pinned }) {
    const caption = `Leaderboard, ${BOARD_LABELS[board]}, ${PERIOD_LABELS[period].toLowerCase()}`;
    const rows = pinned ? [...entries, pinned] : entries;

    return (
        <>
            {/* ≥768: table with row headers */}
            <div className="hidden overflow-hidden rounded-lg border bg-card md:block">
                <Table>
                    <TableCaption className="sr-only">{caption}</TableCaption>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead scope="col" className="w-16 pl-4">#</TableHead>
                            <TableHead scope="col">Learner</TableHead>
                            <TableHead scope="col">Tier</TableHead>
                            <TableHead scope="col" className="pr-4 text-right">Score</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.map((entry) => {
                            const isViewer = entry.user.id === viewerId;
                            const isPinned = entry === pinned;
                            return (
                                <TableRow
                                    key={`${entry.user.id}-${entry.position}`}
                                    aria-current={isViewer ? "true" : undefined}
                                    className={cn(
                                        "relative",
                                        isViewer && "bg-primary-soft/60 hover:bg-primary-soft",
                                        isPinned && "sticky bottom-0 border-t-2 border-t-primary/30 bg-primary-soft"
                                    )}
                                >
                                    <TableHead scope="row" className="pl-4 font-mono font-semibold tabular">{entry.position}</TableHead>
                                    <TableCell className="max-w-0 w-full">
                                        <span className="flex min-w-0 items-center gap-3">
                                            <LearnerAvatar user={entry.user} />
                                            <LearnerLink user={entry.user} isViewer={isViewer} stretch />
                                        </span>
                                    </TableCell>
                                    <TableCell><RankBadge tier={entry.tier} title={entry.tierTitle} /></TableCell>
                                    <TableCell className="pr-4 text-right font-mono font-semibold tabular">{fmt(entry.score)}</TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </div>

            {/* <768: ordered list, no horizontal scroll */}
            <ol className="m-0 list-none divide-y overflow-hidden rounded-lg border bg-card p-0 md:hidden" aria-label={caption}>
                {rows.map((entry) => {
                    const isViewer = entry.user.id === viewerId;
                    return (
                        <li
                            key={`${entry.user.id}-${entry.position}`}
                            aria-current={isViewer ? "true" : undefined}
                            className={cn(
                                "relative flex min-h-14 items-center gap-3 px-3 py-2.5",
                                isViewer && "bg-primary-soft/60",
                                entry === pinned && "border-t-2 border-t-primary/30 bg-primary-soft"
                            )}
                        >
                            <span className="w-8 shrink-0 text-center font-mono text-sm font-semibold tabular">{entry.position}</span>
                            <LearnerAvatar user={entry.user} />
                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                <LearnerLink user={entry.user} isViewer={isViewer} stretch />
                                <RankBadge tier={entry.tier} title={entry.tierTitle} />
                            </div>
                            <span className="shrink-0 font-mono text-sm font-semibold tabular">{fmt(entry.score)}</span>
                        </li>
                    );
                })}
            </ol>
        </>
    );
}

function StandingCard({ me, board, period }) {
    const unit = SCORE_UNITS[board];
    const ranked = Boolean(me?.position);

    return (
        <section aria-labelledby="ranking-me-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
                <h2 id="ranking-me-heading" className="text-sm font-semibold text-foreground">Your standing</h2>
                <RankBadge tier={me?.tier} title={me?.title} />
            </div>

            {ranked ? (
                <div className="flex items-baseline gap-3">
                    <span className="font-mono text-3xl font-semibold tabular">#{fmt(me.position)}</span>
                    <span className="font-mono text-sm text-muted-foreground tabular">
                        {fmt(me.score)} {unit} · {PERIOD_LABELS[period].toLowerCase()}
                    </span>
                </div>
            ) : (
                <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">
                        {period === "30d"
                            ? "No score in the last 30 days yet. Complete a lesson or a challenge to join this board."
                            : "Complete a lesson to join the leaderboard."}
                    </p>
                    <Button asChild size="sm">
                        <Link href="/learning"><LuBookOpen />Go to My learning</Link>
                    </Button>
                </div>
            )}

            <RankProgress standing={me} unit={unit} />

            {me && !me.visible ? (
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <LuEyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {me.optedOut ? (
                        <span>
                            You are hidden from the leaderboard; only you see this position.{" "}
                            <Link href="/settings#settings-privacy" className="font-medium text-primary-ink hover:underline">Settings</Link>
                        </span>
                    ) : (
                        <span>Staff and locked accounts are not shown on the leaderboard; only you see this position.</span>
                    )}
                </p>
            ) : null}
        </section>
    );
}

function TierLadder({ tiers, current, board }) {
    return (
        <section aria-labelledby="ranking-tiers-heading" className="flex flex-col gap-3 rounded-lg border bg-card p-4">
            <h2 id="ranking-tiers-heading" className="text-sm font-semibold text-foreground">
                {BOARD_LABELS[board]} tiers
            </h2>
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {[...tiers].reverse().map((tier) => (
                    <li
                        key={tier.tier}
                        aria-current={tier.tier === current ? "true" : undefined}
                        className={cn(
                            "flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm",
                            tier.tier === current && "bg-muted"
                        )}
                    >
                        <span className="flex items-center gap-2">
                            <span className={cn("size-2 rounded-full", TIER_DOT[tier.tier] || TIER_DOT[1])} aria-hidden="true" />
                            <span className={tier.tier === current ? "font-semibold" : undefined}>{tier.title}</span>
                            {tier.tier === current ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                        </span>
                        <span className="font-mono text-xs text-muted-foreground tabular">{fmt(tier.minScore)}+</span>
                    </li>
                ))}
            </ol>
            {board === "overall" ? <p className="text-xs text-muted-foreground">{OVERALL_FORMULA}</p> : null}
        </section>
    );
}

function BoardSkeleton() {
    return (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading leaderboard">
            <div className="grid gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}
            </div>
            <div className="space-y-px overflow-hidden rounded-lg border">
                {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12 rounded-none" />)}
            </div>
        </div>
    );
}

export default function RankingPage() {
    const { status, data: session } = useSession();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const { board, period } = parseRankingQuery(searchParams);

    const { data, isLoading, isError, error, refetch, isFetching } = useQuery(userQueries.ranking(status, board, period));

    const setQuery = (next) => {
        const params = new URLSearchParams(searchParams);
        Object.entries(next).forEach(([key, value]) => params.set(key, value));
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const viewerId = session?.user?.id;
    const entries = data?.entries || [];
    const me = data?.me || null;
    const podium = entries.slice(0, 3);
    const rest = entries.slice(3);
    const inTop = entries.some((entry) => entry.user.id === viewerId);
    // Viewer outside the top 50: pinned under the table (visible viewers only; hidden ones see the card).
    const pinned = data?.isPublic && me?.position && me.visible && me.user && !inTop
        ? {
            position: me.position,
            user: me.user,
            score: me.score,
            tier: me.tier,
            tierTitle: me.title,
        }
        : null;
    const updated = minutesAgo(data?.updatedAt);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Leaderboard</h1>
                    <p className="max-w-[60ch] text-sm text-muted-foreground">
                        Rankings from the EXP and points you earn in lessons and challenges. Spending points never lowers your rank.
                    </p>
                </div>
                <div className="flex flex-col gap-1.5">
                    <span id="ranking-period-label" className="text-xs font-medium text-muted-foreground">Period</span>
                    <ToggleGroup
                        type="single"
                        variant="outline"
                        value={period}
                        onValueChange={(value) => value && setQuery({ period: value })}
                        aria-labelledby="ranking-period-label"
                    >
                        {PERIODS.map((value) => (
                            <ToggleGroupItem key={value} value={value} className="px-3">
                                {PERIOD_LABELS[value]}
                            </ToggleGroupItem>
                        ))}
                    </ToggleGroup>
                </div>
            </header>

            <p className="sr-only" aria-live="polite">
                {isFetching ? "" : `Showing ${BOARD_LABELS[board]} leaderboard, ${PERIOD_LABELS[period].toLowerCase()}`}
            </p>

            <Tabs value={board} onValueChange={(value) => setQuery({ board: value })} className="gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b">
                    <TabsList variant="line" className="h-10" aria-label="Leaderboard">
                        {BOARDS.map((value) => (
                            <TabsTrigger key={value} value={value} className="flex-none px-3">
                                {BOARD_LABELS[value]}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {updated && data?.isPublic ? (
                        <span className="pb-2 text-xs text-muted-foreground">{updated}</span>
                    ) : null}
                </div>

                {BOARDS.map((value) => (
                    <TabsContent key={value} value={value} className="mt-0">
                        {value !== board ? null : isLoading ? (
                            <BoardSkeleton />
                        ) : isError ? (
                            <ErrorReload data={error} refetch={refetch} title="Could not load the leaderboard" />
                        ) : (
                            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:grid-rows-[auto_1fr] lg:items-start">
                                <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1 lg:row-span-2">
                                    {!data?.isPublic ? (
                                        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
                                            <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                                <LuLock className="size-5" aria-hidden="true" />
                                            </span>
                                            <div className="space-y-1">
                                                <h2 className="text-sm font-semibold">The public leaderboard opens soon</h2>
                                                <p className="max-w-[48ch] text-sm text-muted-foreground">
                                                    Until then you can follow your own tier and position here and on your profile.
                                                </p>
                                            </div>
                                        </div>
                                    ) : entries.length === 0 ? (
                                        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center">
                                            <h2 className="text-sm font-semibold">
                                                {period === "30d" ? "No one has scored in the last 30 days yet" : "No one is ranked yet"}
                                            </h2>
                                            <p className="text-sm text-muted-foreground">Be the first: finish a lesson or pass a challenge.</p>
                                            <Button asChild size="sm"><Link href="/learning"><LuBookOpen />Go to My learning</Link></Button>
                                        </div>
                                    ) : (
                                        <>
                                            <Podium entries={podium} board={board} viewerId={viewerId} />
                                            {rest.length > 0 || pinned ? (
                                                <BoardTable entries={rest} board={board} period={period} viewerId={viewerId} pinned={pinned} />
                                            ) : null}
                                        </>
                                    )}
                                </div>
                                {/* Phone: standing, board, tiers. Desktop: board left, standing + tiers right. */}
                                <div className="order-1 lg:order-2">
                                    <StandingCard me={me} board={board} period={period} />
                                </div>
                                <div className="order-3 flex flex-col gap-4">
                                    <TierLadder tiers={data?.tiers || []} current={me?.tier} board={board} />
                                    <Button asChild variant="ghost" size="sm" className="self-start">
                                        <Link href="/settings#settings-privacy"><LuSettings />Leaderboard privacy</Link>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
