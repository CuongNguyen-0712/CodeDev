'use client';

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";

import { Button } from "@/components/shadcn/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn/tooltip";
import { Badge } from "@/components/shadcn/badge";
import { cn } from "@/lib/utils";

import { LuBell, LuCheck, LuCircleCheck, LuCoins, LuSparkles, LuTrophy } from "react-icons/lu";

export default function NotificationCenter() {
    const { status } = useSession();
    const { data: user } = useQuery(userQueries.me(status));
    const { data: overview } = useQuery(userQueries.overview(status));

    const [readIds, setReadIds] = useState(new Set());
    const [open, setOpen] = useState(false);

    if (status !== 'authenticated') return null;

    // Synthesize durable notification events from learner state
    const inProgressCount = overview?.courses?.in_progress?.length || 0;
    const completedCount = overview?.courses?.completed?.length || 0;
    const exp = Number(user?.exp) || 0;
    const points = Number(user?.points) || 0;

    const notifications = [
        {
            id: 'welcome',
            type: 'system',
            icon: LuSparkles,
            iconClass: 'text-primary-ink bg-primary-soft',
            title: 'Welcome to CodeDev',
            body: 'Solve interactive coding challenges, earn EXP, and climb the leaderboard.',
            time: 'Platform',
            href: '/home',
        },
        ...(exp > 0 ? [{
            id: 'exp-earned',
            type: 'reward',
            icon: LuTrophy,
            iconClass: 'text-xp bg-xp-soft',
            title: `${exp.toLocaleString()} EXP Accumulated`,
            body: `You are currently Level ${user?.level || 1}. Keep solving challenges to reach the next tier.`,
            time: 'Progress',
            href: '/ranking',
        }] : []),
        ...(points > 0 ? [{
            id: 'points-balance',
            type: 'reward',
            icon: LuCoins,
            iconClass: 'text-warning bg-warning-soft',
            title: `${points.toLocaleString()} Points Available`,
            body: 'You can redeem your earned points for premium courses in the catalog.',
            time: 'Balance',
            href: '/orders',
        }] : []),
        ...(inProgressCount > 0 ? [{
            id: 'course-in-progress',
            type: 'learning',
            icon: LuCircleCheck,
            iconClass: 'text-info bg-info-soft',
            title: 'Course in progress',
            body: `You have ${inProgressCount} active course${inProgressCount > 1 ? 's' : ''}. Pick up where you left off.`,
            time: 'Learning',
            href: '/learning',
        }] : []),
        ...(completedCount > 0 ? [{
            id: 'course-completed',
            type: 'achievement',
            icon: LuCircleCheck,
            iconClass: 'text-success bg-success-soft',
            title: 'Course completed',
            body: `Great job! You have completed ${completedCount} course${completedCount > 1 ? 's' : ''}.`,
            time: 'Milestone',
            href: '/learning',
        }] : []),
    ];

    const unreadCount = notifications.filter(n => !readIds.has(n.id)).length;

    const markAllRead = () => {
        setReadIds(new Set(notifications.map(n => n.id)));
    };

    const handleItemClick = (id) => {
        setReadIds(prev => new Set([...prev, id]));
        setOpen(false);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="relative size-8 text-muted-foreground hover:text-foreground"
                            aria-label={`Notifications (${unreadCount} unread)`}
                        >
                            <LuBell className="size-4" />
                            {unreadCount > 0 && (
                                <span className="absolute top-1 right-1 flex size-2">
                                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-75" />
                                    <span className="relative inline-flex size-2 rounded-full bg-primary" />
                                </span>
                            )}
                        </Button>
                    </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">Notifications</TooltipContent>
            </Tooltip>

            <PopoverContent align="end" className="w-80 p-0 shadow-lg sm:w-96">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">Notifications</span>
                        {unreadCount > 0 && (
                            <Badge variant="primary" className="h-5 px-1.5 text-[10px]">
                                {unreadCount} new
                            </Badge>
                        )}
                    </div>
                    {unreadCount > 0 && (
                        <Button
                            variant="ghost"
                            size="xs"
                            onClick={markAllRead}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            <LuCheck className="mr-1 size-3" />
                            Mark all read
                        </Button>
                    )}
                </div>

                <div className="max-h-96 divide-y overflow-y-auto">
                    {notifications.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground">
                            No notifications yet
                        </div>
                    ) : (
                        notifications.map((item) => {
                            const isRead = readIds.has(item.id);
                            const Icon = item.icon;

                            return (
                                <Link
                                    key={item.id}
                                    href={item.href}
                                    onClick={() => handleItemClick(item.id)}
                                    className={cn(
                                        "flex items-start gap-3 p-3.5 transition-colors hover:bg-muted/50",
                                        !isRead && "bg-primary-soft/15"
                                    )}
                                >
                                    <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", item.iconClass)}>
                                        <Icon className="size-4" />
                                    </span>
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                        <div className="flex items-center justify-between gap-2">
                                            <p className={cn("truncate text-xs font-medium", !isRead ? "text-foreground font-semibold" : "text-muted-foreground")}>
                                                {item.title}
                                            </p>
                                            <span className="shrink-0 text-[10px] text-muted-foreground">
                                                {item.time}
                                            </span>
                                        </div>
                                        <p className="line-clamp-2 text-xs text-muted-foreground">
                                            {item.body}
                                        </p>
                                    </div>
                                    {!isRead && (
                                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                                    )}
                                </Link>
                            );
                        })
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
