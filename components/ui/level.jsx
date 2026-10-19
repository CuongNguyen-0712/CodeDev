'use client';
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LuAward, LuCoins, LuCrown, LuSparkles, LuTrophy } from "react-icons/lu";

import { cn } from "@/lib/utils";
import { userQueries } from "@/queries/user.query";
import { userKeys } from "@/keys/user.keys";
import { BOARD_LABELS, rankUps } from "@/lib/ranking";
import { notify } from "@/components/ui/alert";
import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/shadcn/dialog";

/**
 * User Level from EXP (see docs/learning-rewards-redesign-plan.md). The server sends
 * { exp, level, levelTitle, levelMinExp, nextLevelMinExp } on /api/user/me; Level only grows
 * with EXP and never changes when points are spent.
 */
export function levelProgress(user) {
    const exp = Number(user?.exp) || 0;
    const level = Number(user?.level) || 1;
    const minExp = Number(user?.levelMinExp) || 0;
    const nextMinExp = user?.nextLevelMinExp == null ? null : Number(user.nextLevelMinExp);
    const isMax = nextMinExp == null;
    const span = isMax ? 1 : Math.max(1, nextMinExp - minExp);
    const percent = isMax ? 100 : Math.min(100, Math.max(0, Math.round(((exp - minExp) / span) * 100)));

    return {
        exp,
        level,
        title: user?.levelTitle || null,
        nextLevel: isMax ? null : level + 1,
        toNext: isMax ? 0 : Math.max(0, nextMinExp - exp),
        percent,
        isMax,
    };
}

export function LevelBadge({ level, title, className }) {
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full bg-xp-soft px-2 py-0.5 text-xs font-semibold text-xp tabular",
                className
            )}
        >
            <LuTrophy className="size-3" aria-hidden="true" />
            Lv {Number(level) || 1}
            {title ? <span className="font-medium opacity-80">· {title}</span> : null}
        </span>
    );
}

/** Progress towards the next level. `compact` renders a thin bar without labels. */
export function ExpProgress({ user, compact = false, className }) {
    const p = levelProgress(user);
    const label = p.isMax
        ? `Level ${p.level}, maximum level reached`
        : `Level ${p.level}: ${p.toNext.toLocaleString()} EXP to level ${p.nextLevel}`;

    const bar = (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={p.percent}
            className={cn("h-1.5 w-full overflow-hidden rounded-full bg-xp-soft", compact && "h-1")}
        >
            <div className="h-full rounded-full bg-xp transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${p.percent}%` }} />
        </div>
    );

    if (compact) return <div className={className}>{bar}</div>;

    return (
        <div className={cn("grid gap-1.5", className)}>
            <div className="flex items-center justify-between gap-2 text-xs">
                <LevelBadge level={p.level} title={p.title} />
                <span className="font-mono tabular text-muted-foreground">
                    {p.isMax ? `${p.exp.toLocaleString()} EXP` : `${p.toNext.toLocaleString()} EXP to Lv ${p.nextLevel}`}
                </span>
            </div>
            {bar}
        </div>
    );
}

// --------------------------------------------------------------------------- ranks
// Tier 1-6 tints from the existing status tokens; the tier name is always shown as text.
const TIER_STYLES = {
    1: "bg-muted text-muted-foreground border-border",
    2: "bg-info-soft text-info border-info/20",
    3: "bg-success-soft text-success border-success/20",
    4: "bg-warning-soft text-warning border-warning/20",
    5: "bg-xp-soft text-xp border-xp/20",
    6: "bg-primary-soft text-primary-soft-foreground border-primary/15",
};

export const tierStyle = (tier) => TIER_STYLES[tier] || TIER_STYLES[1];

/** Tier name of a leaderboard (docs/ranking-plan.md §3). */
export function RankBadge({ tier, title, className }) {
    const Icon = Number(tier) >= 6 ? LuCrown : LuAward;
    return (
        <span
            className={cn(
                "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
                tierStyle(Number(tier)),
                className
            )}
        >
            <Icon className="size-3" aria-hidden="true" />
            {title || "Unranked"}
        </span>
    );
}

/** Progress of a standing (lib/ranking toStanding) towards the next tier. */
export function RankProgress({ standing, unit = "pts", className }) {
    if (!standing) return null;
    const label = standing.next
        ? `${standing.toNext.toLocaleString()} ${unit} to ${standing.next.title}`
        : `Top tier reached`;

    return (
        <div className={cn("grid gap-1", className)}>
            <Progress
                value={standing.percent}
                getValueLabel={() => label}
                aria-label={`Progress to the next tier: ${label}`}
                className="h-1.5 bg-muted"
            />
            <span className="font-mono text-xs text-muted-foreground tabular">{label}</span>
        </div>
    );
}

/**
 * Level, a thin EXP bar and the point balance for pages without the app navbar (learning
 * workspace, course detail). Links to the profile, where the EXP history lives.
 */
export function LevelPointsChip({ className }) {
    const { status } = useSession();
    const { data } = useQuery(userQueries.me(status));
    if (status !== "authenticated" || !data) return null;

    const p = levelProgress(data);
    return (
        <Link
            href="/profile"
            className={cn(
                "flex shrink-0 items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
                className
            )}
            aria-label={`Level ${p.level}, ${p.exp.toLocaleString()} EXP, ${(Number(data.points) || 0).toLocaleString()} points. Open profile`}
        >
            <span className="font-mono font-semibold text-xp tabular">Lv {p.level}</span>
            <ExpProgress user={data} compact className="w-16 max-sm:hidden" />
            <span className="flex items-center gap-1 font-mono text-muted-foreground tabular">
                <LuCoins className="size-3.5 text-warning" aria-hidden="true" />
                {(Number(data.points) || 0).toLocaleString()}
            </span>
        </Link>
    );
}

// --------------------------------------------------------------------------- reward feedback
const LEVEL_UP_EVENT = "codedev:level-up";
const REWARDS_EVENT = "codedev:rewards";

/**
 * One toast per award ("+20 points · +15 EXP") and, when the level went up, the level-up dialog.
 * `rewards`: { awardedPoints, awardedExp, level?, previousLevel? } as returned by the server.
 * `id` de-duplicates against the realtime toast of the same event.
 */
export function announceRewards(rewards, { title, id } = {}) {
    const points = Number(rewards?.awardedPoints) || 0;
    const exp = Number(rewards?.awardedExp) || 0;
    const parts = [];
    if (points > 0) parts.push(`+${points} points`);
    if (exp > 0) parts.push(`+${exp} EXP`);

    if (parts.length) {
        notify(200, title ? `${title} · ${parts.join(" · ")}` : parts.join(" · "), { id });
    } else if (title) {
        notify(200, title, { id });
    }

    // RankUpWatcher refetches the ranks and toasts a new tier.
    if ((points > 0 || exp > 0) && typeof window !== "undefined") {
        window.dispatchEvent(new Event(REWARDS_EVENT));
    }

    const level = Number(rewards?.level) || 0;
    const previousLevel = Number(rewards?.previousLevel) || 0;
    if (level > previousLevel && previousLevel > 0 && typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent(LEVEL_UP_EVENT, { detail: { level, previousLevel } }));
    }
}

/**
 * Mounted once in the root providers: after a reward, refetches the learner's ranks and toasts each
 * board whose tier went up (no dialog: the level-up dialog stays the main moment, ranking-plan §8).
 */
export function RankUpWatcher() {
    const { data: session, status } = useSession();
    const queryClient = useQueryClient();
    const { data } = useQuery(userQueries.ranks(status));
    const last = useRef(null);
    const userId = session?.user?.id;

    useEffect(() => {
        if (!data || !userId) return;
        // Compare only snapshots of the same account (sign-out / switch resets the baseline).
        if (last.current?.userId === userId) {
            for (const up of rankUps(last.current.ranks, data)) {
                notify(200, `Rank up! ${up.title} on the ${BOARD_LABELS[up.board]} board`, { id: `rank-up-${up.board}-${up.title}` });
            }
        }
        last.current = { userId, ranks: data };
    }, [data, userId]);

    useEffect(() => {
        const onRewards = () => queryClient.invalidateQueries({ queryKey: userKeys.ranks() });
        window.addEventListener(REWARDS_EVENT, onRewards);
        return () => window.removeEventListener(REWARDS_EVENT, onRewards);
    }, [queryClient]);

    return null;
}

/** Mounted once in the root providers; opens when announceRewards reports a level-up. */
export function LevelUpDialog() {
    const [levelUp, setLevelUp] = useState(null);

    useEffect(() => {
        const onLevelUp = (event) => setLevelUp(event.detail);
        window.addEventListener(LEVEL_UP_EVENT, onLevelUp);
        return () => window.removeEventListener(LEVEL_UP_EVENT, onLevelUp);
    }, []);

    const gained = levelUp ? levelUp.level - levelUp.previousLevel : 0;

    return (
        <Dialog open={Boolean(levelUp)} onOpenChange={(open) => !open && setLevelUp(null)}>
            <DialogContent className="sm:max-w-sm text-center">
                <DialogHeader className="items-center">
                    <span className="mb-2 flex size-14 items-center justify-center rounded-full bg-xp-soft text-xp motion-safe:animate-bounce">
                        <LuSparkles className="size-7" aria-hidden="true" />
                    </span>
                    <DialogTitle className="text-xl">Level {levelUp?.level}!</DialogTitle>
                    <DialogDescription>
                        {gained > 1
                            ? `You climbed ${gained} levels at once. Keep learning to reach level ${(levelUp?.level || 0) + 1}.`
                            : `You reached level ${levelUp?.level}. Keep learning to reach the next one.`}
                    </DialogDescription>
                </DialogHeader>
                <DialogFooter className="sm:justify-center">
                    <Button onClick={() => setLevelUp(null)}>Continue</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
