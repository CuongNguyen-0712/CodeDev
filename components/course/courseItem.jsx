import { useState, useTransition } from "react";

import Link from "next/link";

import { levelMapping } from "@/constants/constants";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";
import { useSession } from "next-auth/react";
import { useCourseRegister } from "@/mutations/course.mutation";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";

import {
    LuArrowRight,
    LuLoaderCircle,
    LuPlus,
    LuSignal,
    LuSignalHigh,
    LuSignalLow,
    LuSignalMedium,
    LuStar,
} from "react-icons/lu";

// Level is a neutral outline badge with a signal icon; the text label carries the meaning.
export const LEVEL_ICON = {
    beginner: LuSignalLow,
    intermediate: LuSignalMedium,
    advanced: LuSignalHigh,
    expert: LuSignal,
    master: LuSignal,
};

export const formatDuration = (minutes) => {
    const value = Number(minutes || 0);
    if (value < 60) return `${value}m`;
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
};

export const CourseItem = ({ item }) => {
    const level = levelMapping[item.level] || levelMapping['beginner'];
    const LevelIcon = LEVEL_ICON[item.level] || LuSignalLow;
    const cost = Number(item.cost || 0);
    const rating = Number(item.rating || 0);

    const { status } = useSession();

    const [dataRegistered, setDataRegistered] = useState([]);
    const [isNavigating, startTransition] = useTransition();

    const { showAlert: alert } = useApp();
    const { navigate } = useRouterActions();

    const registerMutation = useCourseRegister();

    const isEnrolled = dataRegistered.includes(item.id) || Boolean(item?.is_registered);
    const isBusy = registerMutation.isPending || isNavigating;

    const handleSubmit = async ({ id, isCost }) => {
        if (!id) return;

        if (isCost) {
            alert(400, 'The payment feature is not supported yet. Please try again later.');
            return;
        }

        if (isEnrolled) {
            startTransition(() => {
                navigate({ path: `/learning/${id}` });
            });
            return;
        }

        try {
            await registerMutation.mutateAsync(id);

            setDataRegistered((prev) => [...prev, id]);
            alert(201, 'Successfully registered for the course.', () => navigate({ path: `/learning/${id}` }));
        }
        catch (error) {
            alert(error.status || 500, error.message || 'An error occurred while registering for the course.');
        }
    };

    const stats = [
        { label: 'Modules', value: item.modules || 0 },
        { label: 'Lessons', value: item.lessons || 0 },
        { label: 'Duration', value: formatDuration(item.duration) },
    ];

    return (
        <article className="group/course flex h-full flex-col gap-3.5 rounded-lg border border-border bg-card p-4 text-card-foreground transition-all duration-150 hover:border-primary/50 hover:shadow-sm">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-background">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={item.language_logo || '/image/static/default.svg'}
                        alt=""
                        width={22}
                        height={22}
                        loading="lazy"
                        className="size-[22px] object-contain"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = '/image/static/default.svg';
                        }}
                    />
                </span>
                <div className="min-w-0 flex-1">
                    <h3 className="text-sm leading-snug font-semibold">
                        <Link
                            href={`/course/${item.id}`}
                            className="line-clamp-2 rounded-sm text-foreground hover:text-primary hover:underline hover:underline-offset-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                            title={item.title}
                        >
                            {item.title}
                        </Link>
                    </h3>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {[item.language_name, item.category_name].filter(Boolean).join(' / ') || 'General'}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline" className="text-muted-foreground">
                    <LevelIcon aria-hidden="true" />
                    {level.label}
                </Badge>
                {cost > 0 ? (
                    <Badge variant="outline" className="font-mono tabular">${cost.toFixed(2)}</Badge>
                ) : (
                    <Badge variant="success">Free</Badge>
                )}
                {isEnrolled && <Badge variant="primary">Enrolled</Badge>}
                <span
                    className="ml-auto flex items-center gap-1 font-mono text-xs font-medium text-foreground tabular"
                    title={`Rated ${rating.toFixed(1)} out of 5`}
                >
                    <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                    <span className="sr-only">Rating</span>
                    {rating.toFixed(1)}
                </span>
            </div>

            <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md border bg-border">
                {stats.map((stat) => (
                    <div key={stat.label} className="bg-card px-2.5 py-1.5">
                        <dt className="text-[11px] text-muted-foreground">{stat.label}</dt>
                        <dd className="font-mono text-sm font-medium tabular">{stat.value}</dd>
                    </div>
                ))}
            </dl>

            {item.instructor && (
                <p className="truncate text-xs text-muted-foreground" title={item.instructor}>
                    Instructor <span className="font-medium text-foreground">{item.instructor}</span>
                </p>
            )}

            <div className="mt-auto flex items-center gap-2 pt-0.5">
                {status === 'authenticated' && (
                    <Button
                        type="button"
                        size="sm"
                        variant={isEnrolled ? 'soft' : 'default'}
                        className="flex-1"
                        onClick={() => handleSubmit({ id: item.id, isCost: cost > 0 && !isEnrolled })}
                        disabled={isBusy}
                    >
                        {isBusy ? (
                            <LuLoaderCircle className="animate-spin" aria-hidden="true" />
                        ) : isEnrolled ? (
                            <LuArrowRight aria-hidden="true" />
                        ) : (
                            <LuPlus aria-hidden="true" />
                        )}
                        {registerMutation.isPending
                            ? 'Enrolling...'
                            : isEnrolled
                                ? 'Continue learning'
                                : cost === 0
                                    ? 'Enroll for free'
                                    : `Enroll for $${cost.toFixed(2)}`}
                    </Button>
                )}

                <Button
                    asChild
                    size="sm"
                    variant="outline"
                    className={status === 'authenticated' ? undefined : 'flex-1'}
                >
                    <Link href={`/course/${item.id}`} aria-label={`View details for ${item.title}`}>
                        Details
                    </Link>
                </Button>
            </div>
        </article>
    );
};
