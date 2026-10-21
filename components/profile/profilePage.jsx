'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/queries/user.query";
import { ExpProgress, levelProgress } from "@/components/ui/level";
import ExperienceSection from "@/components/profile/experienceSection";
import { MyRankSummary } from "@/components/ranking/rankSummary";

import { ErrorReload } from "@/components/ui/error";
import { formatPoints } from "@/components/ui/navbar";
import { COURSE_STATUS } from "@/components/learning/course";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/shadcn/avatar";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Progress } from "@/components/shadcn/progress";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/shadcn/tabs";
import { cn } from "@/lib/utils";

import {
    LuArrowRight,
    LuBookOpen,
    LuCircleCheck,
    LuCircleAlert,
    LuCode,
    LuEye,
    LuEyeOff,
    LuCoins,
    LuSparkles,
    LuLibrary,
    LuTrophy,
    LuUserPen,
} from "react-icons/lu";

// Course lists shown on the profile, in the order a learner cares about them.
const ACTIVITY_TABS = ['in_progress', 'completed', 'enrolled'];

const EMPTY_COPY = {
    in_progress: {
        title: 'Nothing in progress',
        description: 'Start a lesson in one of your courses and it will show up here.',
    },
    completed: {
        title: 'No completed courses yet',
        description: 'Finish every lesson in a course to see it listed here.',
    },
    enrolled: {
        title: 'No courses waiting to start',
        description: 'Courses you enroll in but have not started yet appear here.',
    },
};

export function initials(name = '') {
    const parts = String(name).trim().split(/[\s._-]+/).filter(Boolean);
    return (parts[0]?.[0] || 'U').concat(parts[1]?.[0] || '').toUpperCase();
}

function toPercent(done, total) {
    const totalNum = Number(total) || 0;
    if (totalNum <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((Number(done) || 0) / totalNum * 100)));
}

export function Stat({ icon: Icon, label, iconClassName, children }) {
    return (
        <div className="flex min-w-0 flex-col gap-1 bg-card px-3 py-2.5 transition-colors sm:px-4 sm:py-3 hover:bg-accent/30">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Icon className={cn("size-3.5 shrink-0", iconClassName)} aria-hidden="true" />
                <span className="truncate">{label}</span>
            </dt>
            <dd className="m-0 truncate text-base font-semibold text-foreground sm:text-lg">{children}</dd>
        </div>
    );
}

function ProfileSkeleton() {
    return (
        <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading profile">
            <div className="flex items-start gap-4">
                <Skeleton className="size-16 rounded-full" />
                <div className="flex-1 space-y-2.5">
                    <Skeleton className="h-9 w-56 max-w-full" />
                    <Skeleton className="h-4 w-72 max-w-full" />
                    <Skeleton className="h-8 w-28" />
                </div>
            </div>
            <Skeleton className="h-[74px] w-full rounded-lg" />
            <div className="grid gap-6 lg:grid-cols-3">
                <Skeleton className="h-72 rounded-lg lg:col-span-2" />
                <Skeleton className="h-72 rounded-lg" />
            </div>
        </div>
    );
}

export function CourseList({ status, courses, total }) {
    if (courses.length === 0) {
        const copy = EMPTY_COPY[status];
        return (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <LuBookOpen className="size-5" aria-hidden="true" />
                </span>
                <div className="space-y-1">
                    <h3 className="text-sm font-semibold">{copy.title}</h3>
                    <p className="max-w-[44ch] text-sm text-muted-foreground">{copy.description}</p>
                </div>
                <Button asChild variant="outline" size="sm">
                    <Link href="/course"><LuLibrary />Browse courses</Link>
                </Button>
            </div>
        );
    }

    return (
        <>
            <ul className="m-0 list-none divide-y p-0">
                {courses.map((course) => {
                    const percent = toPercent(course.progress, course.total);
                    return (
                        <li key={course.id}>
                            <Link
                                href={`/course/${course.id}`}
                                className="group/course flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                            >
                                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={course.language_logo || '/image/static/default.svg'}
                                        alt=""
                                        width={22}
                                        height={22}
                                        className="size-[22px] object-contain"
                                        onError={(e) => {
                                            e.currentTarget.onerror = null;
                                            e.currentTarget.src = '/image/static/default.svg';
                                        }}
                                    />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-foreground group-hover/course:text-primary-ink">
                                        {course.title}
                                    </span>
                                    <span className="block truncate tabular text-xs text-muted-foreground">
                                        {[course.language_name, course.category_name].filter(Boolean).join(' / ') || 'General'}
                                    </span>
                                </span>
                                <span className="hidden w-40 shrink-0 items-center gap-3 sm:flex">
                                    <Progress
                                        value={percent}
                                        className="h-1.5 flex-1 bg-muted"
                                        aria-label={`${course.title} progress`}
                                    />
                                    <span className="w-14 text-right text-xs text-muted-foreground tabular">
                                        {Number(course.progress) || 0}/{Number(course.total) || 0}
                                    </span>
                                </span>
                                <span className="text-xs text-muted-foreground tabular sm:hidden">
                                    {percent}%
                                </span>
                            </Link>
                        </li>
                    );
                })}
            </ul>
            {total > courses.length && (
                <div className="border-t px-4 py-2.5">
                    <Button asChild variant="link" size="sm" className="h-auto px-0">
                        <Link href="/learning">
                            View all {total} in My learning
                            <LuArrowRight />
                        </Link>
                    </Button>
                </div>
            )}
        </>
    );
}

/** Share of courses per language (`percentage` from the API). */
export function LanguageList({ languages }) {
    return (
        <ul className="m-0 flex list-none flex-col gap-4 rounded-lg border bg-card p-4">
            {languages.map((lang) => {
                const percent = Math.round(Number(lang.percentage) || 0);
                const count = Number(lang.total) || 0;
                // A share only means something next to other languages.
                const showShare = languages.length > 1;
                return (
                    <li key={lang.name || 'unknown'} className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={lang.logo || '/image/static/default.svg'}
                                alt=""
                                width={16}
                                height={16}
                                className="size-4 shrink-0 object-contain"
                                onError={(e) => {
                                    e.currentTarget.onerror = null;
                                    e.currentTarget.src = '/image/static/default.svg';
                                }}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">
                                {lang.name || 'Other'}
                            </span>
                            <span className="text-xs text-muted-foreground tabular">
                                {count} {count === 1 ? 'course' : 'courses'}
                            </span>
                        </div>
                        {showShare && (
                            <div className="flex items-center gap-3">
                                <Progress
                                    value={percent}
                                    className="h-1.5 flex-1 bg-muted"
                                    aria-label={`${lang.name || 'Other'} share of courses`}
                                />
                                <span className="w-10 text-right text-xs text-muted-foreground tabular">
                                    {percent}%
                                </span>
                            </div>
                        )}
                    </li>
                );
            })}
        </ul>
    );
}

function ActivitySection({ status }) {
    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.overview(status));

    const byStatus = data?.summary?.by_status || {};
    const languages = Array.isArray(data?.languages) ? data.languages : [];

    return (
        <div className="grid gap-6 lg:grid-cols-3">
            <section aria-labelledby="profile-activity-heading" className="flex min-w-0 flex-col gap-3 lg:col-span-2">
                <div className="flex min-h-8 items-center justify-between gap-3">
                    <h2 id="profile-activity-heading" className="text-base font-semibold text-foreground">
                        Course activity
                    </h2>
                    {!isLoading && !isError && (
                        <span className="text-xs text-muted-foreground tabular">
                            {Number(data?.summary?.total) || 0} enrolled in total
                        </span>
                    )}
                </div>

                {isLoading ? (
                    <div className="space-y-px overflow-hidden rounded-lg border">
                        <Skeleton className="h-11 rounded-none" />
                        {Array.from({ length: 4 }, (_, index) => (
                            <div key={index} className="flex items-center gap-3 px-4 py-3">
                                <Skeleton className="size-9 rounded-md" />
                                <div className="flex-1 space-y-1.5">
                                    <Skeleton className="h-4 w-48 max-w-full" />
                                    <Skeleton className="h-3 w-28" />
                                </div>
                                <Skeleton className="hidden h-1.5 w-40 sm:block" />
                            </div>
                        ))}
                    </div>
                ) : isError ? (
                    <ErrorReload data={error} refetch={refetch} />
                ) : (
                    <Tabs defaultValue="in_progress" className="gap-0 overflow-hidden rounded-lg border bg-card">
                        <div className="overflow-x-auto overflow-y-hidden border-b px-2 pt-2 pb-1.5">
                            <TabsList variant="line" className="h-9">
                                {ACTIVITY_TABS.map((key) => (
                                    <TabsTrigger key={key} value={key} className="flex-none px-2.5">
                                        {COURSE_STATUS[key]?.label}
                                        <span className="text-xs text-muted-foreground tabular">
                                            {Number(byStatus[key]) || 0}
                                        </span>
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                        {ACTIVITY_TABS.map((key) => (
                            <TabsContent key={key} value={key}>
                                <CourseList
                                    status={key}
                                    courses={Array.isArray(data?.courses?.[key]) ? data.courses[key] : []}
                                    total={Number(byStatus[key]) || 0}
                                />
                            </TabsContent>
                        ))}
                    </Tabs>
                )}
            </section>

            <section aria-labelledby="profile-languages-heading" className="flex min-w-0 flex-col gap-3">
                <div className="flex min-h-8 items-center">
                    <h2 id="profile-languages-heading" className="text-base font-semibold text-foreground">
                        Languages
                    </h2>
                </div>

                {isLoading ? (
                    <div className="space-y-4 rounded-lg border p-4">
                        {Array.from({ length: 3 }, (_, index) => (
                            <div key={index} className="space-y-2">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-1.5 w-full" />
                            </div>
                        ))}
                    </div>
                ) : isError ? null : languages.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-10 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuCode className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">No languages yet</h3>
                            <p className="text-sm text-muted-foreground">
                                Languages from courses you start or finish are counted here.
                            </p>
                        </div>
                        <Button asChild variant="outline" size="sm">
                            <Link href="/learning"><LuBookOpen />Go to My learning</Link>
                        </Button>
                    </div>
                ) : (
                    <LanguageList languages={languages} />
                )}
            </section>
        </div>
    );
}

export default function ProfilePage() {
    const { status } = useSession();

    const { data, isLoading, error, isError, refetch } = useQuery(userQueries.me(status));
    const { data: privacy } = useQuery(userQueries.privacy(status));

    const isSessionLoading = status === 'loading';
    const showLoading = isSessionLoading || (status === 'authenticated' && isLoading);

    const fullName = [data?.surname, data?.name].filter(Boolean).join(' ');
    const displayName = fullName || data?.username || 'Your profile';
    const progress = levelProgress(data);
    const points = Number(data?.points) || 0;

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            {showLoading ? (
                <ProfileSkeleton />
            ) : isError ? (
                <ErrorReload data={error} refetch={refetch} title="Could not load your profile" />
            ) : status !== 'authenticated' ? (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <LuUserPen className="size-5" aria-hidden="true" />
                    </span>
                    <div className="space-y-1">
                        <h1 className="text-sm font-semibold">Sign in to see your profile</h1>
                        <p className="text-sm text-muted-foreground">Your progress, points and courses are tied to your account.</p>
                    </div>
                    <Button asChild size="sm">
                        <Link href="/auth">Sign in</Link>
                    </Button>
                </div>
            ) : (
                <>
                    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-4">
                            <Avatar className="size-14 border sm:size-16">
                                <AvatarImage src={data?.image || undefined} alt="" className="object-cover" />
                                <AvatarFallback className="bg-primary-soft text-base font-semibold text-primary-soft-foreground">
                                    {initials(displayName)}
                                </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0 space-y-2">
                                <h1 className="text-3xl font-semibold tracking-tight break-words text-foreground sm:text-4xl">
                                    {displayName}
                                </h1>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                                    {data?.username && (
                                        <span className="tabular">@{data.username}</span>
                                    )}
                                    {data?.nickname && <span>{data.nickname}</span>}
                                    {data?.email && <span className="break-all">{data.email}</span>}
                                    {data?.email && (
                                        data?.email_verified ? (
                                            <Badge variant="success"><LuCircleCheck aria-hidden="true" />Email verified</Badge>
                                        ) : (
                                            <Badge variant="warning"><LuCircleAlert aria-hidden="true" />Email not verified</Badge>
                                        )
                                    )}
                                </div>
                                {data?.bio && (
                                    <p className="max-w-[65ch] text-sm whitespace-pre-line text-foreground/90">{data.bio}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-col items-start gap-2 sm:items-end">
                            <div className="flex flex-wrap gap-2">
                                {privacy?.showProfile && data?.username ? (
                                    <Button asChild variant="outline">
                                        <Link href={`/profile/${encodeURIComponent(data.username)}`}><LuEye />Public profile</Link>
                                    </Button>
                                ) : null}
                                <Button asChild variant="outline">
                                    <Link href="/settings"><LuUserPen />Edit profile</Link>
                                </Button>
                            </div>
                            {privacy ? (
                                <Link
                                    href="/settings#settings-privacy"
                                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline"
                                >
                                    {privacy.showProfile ? <LuEye className="size-3.5" aria-hidden="true" /> : <LuEyeOff className="size-3.5" aria-hidden="true" />}
                                    {privacy.showProfile
                                        ? `Visible to other learners · courses ${privacy.showLearning ? 'shown' : 'hidden'}`
                                        : 'Hidden from other learners'}
                                </Link>
                            ) : null}
                        </div>
                    </header>

                    <div className="overflow-hidden rounded-lg border">
                        <dl className="m-0 grid grid-cols-3 gap-px bg-border">
                            <Stat icon={LuTrophy} iconClassName="text-xp" label="Level">
                                <span className="tabular font-semibold text-xp">{progress.level}</span>
                                {progress.title ? <span className="ml-1.5 hidden text-xs font-medium text-muted-foreground sm:inline sm:truncate">{progress.title}</span> : null}
                            </Stat>
                            <Stat icon={LuSparkles} iconClassName="text-primary-ink" label="Experience">
                                <span className="tabular font-semibold">{progress.exp.toLocaleString()}</span>
                                <span className="ml-1 text-xs font-medium text-muted-foreground">EXP</span>
                            </Stat>
                            <Stat icon={LuCoins} iconClassName="text-warning" label="Points">
                                <span className="tabular font-semibold" title={`${points} points`}>{formatPoints(points)}</span>
                            </Stat>
                        </dl>
                        <div className="border-t bg-card px-4 py-3">
                            <ExpProgress user={data} />
                            <p className="mt-2 text-xs text-muted-foreground">
                                Level grows with the EXP you earn from lessons, challenges and finished courses. Points are a separate balance you can spend on courses; spending them never lowers your level.
                            </p>
                        </div>
                    </div>

                    <MyRankSummary />
                    <ActivitySection status={status} />
                    <ExperienceSection status={status} currentLevel={progress.level} />
                </>
            )}
        </div>
    );
}
