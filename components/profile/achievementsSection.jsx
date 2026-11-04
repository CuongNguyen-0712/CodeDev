'use client';

import { LuAward, LuFlame, LuGraduationCap, LuLock, LuMedal, LuShieldCheck, LuSparkles, LuZap } from "react-icons/lu";
import { Badge } from "@/components/shadcn/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";

const BADGES = [
    {
        id: "first_blood",
        title: "First Step",
        description: "Enrolled in your first course on CodeDev.",
        icon: LuGraduationCap,
        isUnlocked: (user, overview) => (Number(overview?.summary?.total) || 0) > 0,
    },
    {
        id: "exp_starter",
        title: "EXP Pioneer",
        description: "Earned your first 100 EXP from challenges.",
        icon: LuSparkles,
        isUnlocked: (user) => (Number(user?.exp) || 0) >= 100,
    },
    {
        id: "level_up",
        title: "Level Climber",
        description: "Reached Level 2 or higher.",
        icon: LuZap,
        isUnlocked: (user) => (Number(user?.level) || 1) >= 2,
    },
    {
        id: "course_finisher",
        title: "Course Completer",
        description: "Completed at least one entire course.",
        icon: LuAward,
        isUnlocked: (user, overview) => (Number(overview?.summary?.by_status?.completed) || 0) >= 1,
    },
    {
        id: "century_club",
        title: "Century Club",
        description: "Accumulated 500+ EXP across all challenges.",
        icon: LuShieldCheck,
        isUnlocked: (user) => (Number(user?.exp) || 0) >= 500,
    },
    {
        id: "point_master",
        title: "Points Hoarder",
        description: "Accumulated 200+ points to redeem premium courses.",
        icon: LuMedal,
        isUnlocked: (user) => (Number(user?.points) || 0) >= 200,
    },
];

export default function AchievementsSection({ user, overview }) {
    const unlockedCount = BADGES.filter((b) => b.isUnlocked(user, overview)).length;

    return (
        <section aria-labelledby="achievements-heading" className="space-y-3">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h2 id="achievements-heading" className="text-base font-semibold text-foreground">
                        Achievements & Badges
                    </h2>
                    <Badge variant="outline" className="tabular text-xs">
                        {unlockedCount}/{BADGES.length} unlocked
                    </Badge>
                </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BADGES.map((badge) => {
                    const unlocked = badge.isUnlocked(user, overview);
                    const Icon = badge.icon;

                    return (
                        <Tooltip key={badge.id}>
                            <TooltipTrigger asChild>
                                <div
                                    className={cn(
                                        "flex min-w-0 items-center gap-3 rounded-lg border px-3.5 py-3 transition-colors",
                                        unlocked
                                            ? "border-primary/25 bg-card hover:border-primary/50"
                                            : "border-border/60 bg-muted/30"
                                    )}
                                >
                                    <div className={cn("flex shrink-0", unlocked ? "text-primary-ink" : "text-muted-foreground")}>
                                        {unlocked ? <Icon className="size-5" /> : <LuLock className="size-4 text-muted-foreground" />}
                                    </div>
                                    <div className="min-w-0">
                                        <p className={cn("truncate text-xs font-semibold", unlocked ? "text-foreground" : "text-muted-foreground")}>{badge.title}</p>
                                        <span className="text-xs text-muted-foreground">
                                            {unlocked ? "Unlocked" : "Locked"}
                                        </span>
                                        {/* The tooltip needs a pointer; keyboard and screen-reader users read it here. */}
                                        <span className="sr-only">{badge.description}</span>
                                    </div>
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[200px] text-center text-xs">
                                <p className="font-semibold">{badge.title}</p>
                                <p className="mt-0.5 text-muted-foreground">{badge.description}</p>
                            </TooltipContent>
                        </Tooltip>
                    );
                })}
            </div>
        </section>
    );
}
