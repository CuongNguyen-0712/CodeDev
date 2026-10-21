'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";

import { CourseList, LanguageList, Stat, initials } from "@/components/profile/profilePage";
import { RankSummary } from "@/components/ranking/rankSummary";
import { ExpProgress, LevelBadge, levelProgress } from "@/components/ui/level";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";

import { LuCircleCheck, LuCode, LuEyeOff, LuSparkles, LuTrophy } from "react-icons/lu";

const memberSince = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
        ? date.toLocaleDateString("en", { month: "short", year: "numeric" })
        : null;
};

/**
 * Another learner's profile as everyone sees it (docs/ui-ux/PROFILE_AND_LEADERBOARD_PLAN.md §3).
 * `profile` comes from profileService.getPublicProfile: no email, points or orders.
 */
export default function PublicProfilePage({ profile }) {
    const { data: session } = useSession();
    const isSelf = session?.user?.id === profile.id;

    const displayName = profile.nickname || profile.username;
    const progress = levelProgress(profile);
    const byStatus = profile.byStatus || {};
    const completed = Number(byStatus.completed) || 0;
    const inProgress = Number(byStatus.in_progress) || 0;
    const courses = Array.isArray(profile.courses) ? profile.courses : [];
    const languages = Array.isArray(profile.languages) ? profile.languages : [];
    const since = memberSince(profile.memberSince);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            {isSelf ? (
                <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary-soft-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>This is how other learners see your profile.</p>
                    <div className="flex gap-4">
                        <Link href="/settings#settings-privacy" className="font-medium underline underline-offset-4">
                            Change what is shown
                        </Link>
                        <Link href="/profile" className="font-medium underline underline-offset-4">
                            My profile
                        </Link>
                    </div>
                </div>
            ) : null}

            <header className="flex min-w-0 items-start gap-4">
                <Avatar className="size-16 border sm:size-20">
                    <AvatarImage src={profile.image || undefined} alt="" className="object-cover" />
                    <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary-soft-foreground">
                        {initials(displayName)}
                    </AvatarFallback>
                </Avatar>
                <div className="min-w-0 space-y-2">
                    <h1 className="text-3xl font-semibold tracking-tight break-words text-foreground sm:text-4xl">
                        {displayName}
                    </h1>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                        <span className="tabular">@{profile.username}</span>
                        {since ? <span>Member since {since}</span> : null}
                        <LevelBadge level={progress.level} title={progress.title} />
                    </div>
                </div>
            </header>

            <div className="overflow-hidden rounded-lg border">
                <dl className="m-0 grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                    <Stat icon={LuTrophy} iconClassName="text-xp" label="Level">
                        <span className="tabular font-semibold text-xp">{progress.level}</span>
                    </Stat>
                    <Stat icon={LuSparkles} iconClassName="text-primary-ink" label="Experience">
                        <span className="tabular font-semibold">{progress.exp.toLocaleString()}</span>
                        <span className="ml-1 text-xs font-medium text-muted-foreground">EXP</span>
                    </Stat>
                    <Stat icon={LuCircleCheck} iconClassName="text-success" label="Courses completed">
                        <span className="tabular font-semibold">{completed}</span>
                    </Stat>
                    <Stat icon={LuCode} iconClassName="text-info" label="Challenges solved">
                        <span className="tabular font-semibold">{Number(profile.challengesPassed) || 0}</span>
                    </Stat>
                </dl>
                <div className="border-t bg-card px-4 py-3">
                    <ExpProgress user={profile} />
                </div>
            </div>

            {profile.ranks ? (
                <RankSummary ranks={profile.ranks} headingId="public-ranks-heading" />
            ) : null}

            {profile.showLearning ? (
                <div className="grid gap-6 lg:grid-cols-3">
                    <section aria-labelledby="public-courses-heading" className="flex min-w-0 flex-col gap-3 lg:col-span-2">
                        <div className="flex min-h-8 items-center justify-between gap-3">
                            <h2 id="public-courses-heading" className="text-base font-semibold text-foreground">Courses</h2>
                            <span className="text-xs text-muted-foreground tabular">
                                {inProgress} in progress · {completed} completed
                            </span>
                        </div>
                        {courses.length > 0 ? (
                            <div className="overflow-hidden rounded-lg border bg-card">
                                <CourseList status="in_progress" courses={courses} total={courses.length} />
                            </div>
                        ) : (
                            <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                                No courses started yet.
                            </p>
                        )}
                    </section>
                    {languages.length > 0 ? (
                        <section aria-labelledby="public-languages-heading" className="flex min-w-0 flex-col gap-3">
                            <div className="flex min-h-8 items-center">
                                <h2 id="public-languages-heading" className="text-base font-semibold text-foreground">Languages</h2>
                            </div>
                            <LanguageList languages={languages} />
                        </section>
                    ) : null}
                </div>
            ) : (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LuEyeOff className="size-4 shrink-0" aria-hidden="true" />
                    {displayName} keeps their course list private.
                </p>
            )}
        </div>
    );
}
