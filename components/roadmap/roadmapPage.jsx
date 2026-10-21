'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { roadmapQueries } from '@/queries/roadmap.query';
import { onboardingQueries } from '@/queries/premium.query';
import { levelMapping } from '@/constants/constants';
import { useListQueryState } from '@/hooks/useListQueryState';
import { LEVELS } from '@/lib/listFilters';

import { ErrorReload } from '@/components/ui/error';
import SearchBar from '@/components/ui/searchBar';
import { RecommendationCard, RecommendationCardSkeleton } from '@/components/onboarding/recommendationCard';

import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import { Skeleton } from '@/components/shadcn/skeleton';

import { LuArrowRight, LuChevronRight, LuMap, LuRoute, LuSearchX, LuSparkles } from 'react-icons/lu';

// roadmap.roadmaps.level is a level_enum.
const FILTER_MAPPING = [
    {
        name: 'level',
        items: LEVELS.map((value) => ({ name: value.charAt(0).toUpperCase() + value.slice(1), value })),
    },
];

const FALLBACK_LOGO = '/image/static/no_image.png';

function RoadmapRowSkeleton() {
    return (
        <li className="flex items-start gap-4 px-4 py-4">
            <Skeleton className="size-9 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-56 max-w-[60vw]" />
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-2/3 max-w-sm" />
            </div>
            <Skeleton className="h-5 w-20 max-sm:hidden" />
        </li>
    );
}

function LanguageStack({ languages }) {
    // The list query aggregates languages through LEFT JOINs, so a roadmap
    // without courses yields an empty placeholder object. Skip those.
    const items = languages.filter((lang) => lang && lang.id != null);
    const visible = items.slice(0, 3);
    const extra = items.length - visible.length;

    if (items.length === 0) {
        return (
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
                <LuRoute className="size-4" aria-hidden="true" />
            </span>
        );
    }

    return (
        <span className="flex shrink-0 items-center -space-x-2" title={items.map((lang) => lang.name).join(', ')}>
            {visible.map((lang) => (
                <span
                    key={lang.id}
                    className="flex size-9 items-center justify-center overflow-hidden rounded-md border bg-background"
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={lang.logo || FALLBACK_LOGO}
                        alt={lang.name || ''}
                        width={20}
                        height={20}
                        loading="lazy"
                        className="size-5 object-contain"
                        onError={(e) => {
                            e.currentTarget.onerror = null;
                            e.currentTarget.src = FALLBACK_LOGO;
                        }}
                    />
                </span>
            ))}
            {extra > 0 && (
                <span className="flex size-9 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground tabular">
                    +{extra}
                </span>
            )}
        </span>
    );
}

// Signed-in learners get three personalised courses next to the roadmaps; guests see nothing.
function RecommendedStrip() {
    const { status } = useSession();
    const { data, isLoading, isError, error, refetch } = useQuery(onboardingQueries.recommendations(status, 3));

    if (status !== 'authenticated') return null;

    const items = Array.isArray(data?.items) ? data.items.slice(0, 3) : [];
    if (!isLoading && !isError && items.length === 0) return null;

    return (
        <section aria-labelledby="roadmap-recommended-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <h2 id="roadmap-recommended-heading" className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <LuSparkles className="size-4 text-primary-ink" aria-hidden="true" />
                        Recommended for you
                    </h2>
                    {data?.fallback && (
                        <p className="text-xs text-muted-foreground">
                            Popular courses for now.{' '}
                            <Link href="/onboarding" className="text-primary-ink underline-offset-4 hover:underline">
                                Personalise your recommendations
                            </Link>
                        </p>
                    )}
                </div>
                <Button asChild variant="ghost" size="sm">
                    <Link href="/home">
                        See more
                        <LuArrowRight />
                    </Link>
                </Button>
            </div>

            {isError ? (
                <ErrorReload compact data={error} refetch={refetch} title="Could not load your recommendations" />
            ) : (
                <ul
                    className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3"
                    aria-busy={isLoading || undefined}
                    aria-label="Recommended courses"
                >
                    {isLoading
                        ? Array.from({ length: 3 }, (_, index) => (
                            <li key={index}><RecommendationCardSkeleton compact /></li>
                        ))
                        : items.map((item, index) => (
                            <li key={item?.course?.id || index} className="animate-enter" style={{ '--enter-index': index % 20 }}>
                                <RecommendationCard item={item} compact maxReasons={2} />
                            </li>
                        ))}
                </ul>
            )}
        </section>
    );
}

export default function RoadmapPage() {
    const { data, isLoading, isError, error, refetch } = useQuery(roadmapQueries.list());

    // The list is small and cached for every visitor, so it is filtered here; the URL keeps
    // the view (`?q=frontend&level=beginner`) shareable.
    const { search, filter, isFiltered: hasActiveFilters, setSearch, setFilter, reset } = useListQueryState('roadmap');

    // Safely extract roadmaps array
    const roadmaps = useMemo(() => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        return [];
    }, [data]);

    const filteredRoadmaps = useMemo(() => {
        const query = search.toLowerCase();
        const selectedLevels = filter.level || [];

        return roadmaps.filter((item) => {
            const matchesSearch =
                !query ||
                item.title?.toLowerCase().includes(query) ||
                item.description?.toLowerCase().includes(query);

            const matchesLevel = selectedLevels.length === 0 || selectedLevels.includes(item.level);

            return matchesSearch && matchesLevel;
        });
    }, [roadmaps, search, filter.level]);

    const showError = !isLoading && isError;
    const showEmpty = !isLoading && !isError && filteredRoadmaps.length === 0;
    const countLabel = isLoading
        ? 'Loading roadmaps...'
        : `${filteredRoadmaps.length} roadmap${filteredRoadmaps.length === 1 ? '' : 's'}`;
    const emptyTitle = hasActiveFilters ? 'No roadmaps match these filters' : 'No roadmaps published yet';

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 lg:pt-10">
            <header className="space-y-2">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                    Roadmaps
                </h1>
                <p className="max-w-[60ch] text-sm text-muted-foreground">
                    Ordered learning paths for developer roles. Each step links to the courses that cover it, so you always know what to study next.
                </p>
            </header>

            <RecommendedStrip />

            <section className="w-full" aria-label="Search and filter roadmaps">
                <SearchBar
                    data={FILTER_MAPPING}
                    filter={filter}
                    search={search}
                    resultsCount={filteredRoadmaps.length}
                    setSearch={setSearch}
                    setFilter={setFilter}
                    pending={isLoading}
                    placeholderText="Search roadmaps by role, title or skill..."
                />
            </section>

            <section aria-labelledby="roadmap-list-heading" className="flex flex-col gap-3">
                <h2 id="roadmap-list-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                    <LuMap className="size-4 text-muted-foreground" aria-hidden="true" />
                    <span aria-live="polite">{countLabel}</span>
                </h2>

                {showError ? (
                    <div className="rounded-lg border">
                        <ErrorReload data={error} refetch={refetch} />
                    </div>
                ) : showEmpty ? (
                    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                            <LuSearchX className="size-5" aria-hidden="true" />
                        </span>
                        <div className="space-y-1">
                            <h3 className="text-sm font-semibold">{emptyTitle}</h3>
                            <p className="max-w-[48ch] text-sm text-muted-foreground">
                                {hasActiveFilters
                                    ? 'Clear the search or remove the level filter to see every roadmap.'
                                    : 'Roadmaps will appear here once they are published. Browse the course catalog in the meantime.'}
                            </p>
                        </div>
                        {hasActiveFilters ? (
                            <Button variant="outline" size="sm" onClick={reset}>Reset filters</Button>
                        ) : (
                            <Button asChild size="sm">
                                <Link href="/course">Browse courses</Link>
                            </Button>
                        )}
                    </div>
                ) : (
                    <ul className="list-none divide-y overflow-hidden rounded-lg border bg-card">
                        {isLoading
                            ? Array.from({ length: 4 }, (_, index) => <RoadmapRowSkeleton key={index} />)
                            : filteredRoadmaps.map((roadmap, index) => {
                                const levelKey = roadmap.level?.toLowerCase();
                                const levelLabel = levelMapping[levelKey]?.label || roadmap.level || 'All levels';
                                const nodeCount = parseInt(roadmap.nodes, 10) || 0;
                                const languages = Array.isArray(roadmap.languages) ? roadmap.languages : [];

                                return (
                                    <li key={roadmap.id} className="animate-enter" style={{ '--enter-index': index % 20 }}>
                                        <Link
                                            href={`/roadmap/${roadmap.id}`}
                                            className="group flex items-start gap-4 px-4 py-4 outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset active:bg-accent"
                                        >
                                            <LanguageStack languages={languages} />

                                            <div className="min-w-0 flex-1 space-y-1">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                    <h3 className="text-sm font-semibold text-foreground group-hover:text-primary-ink">
                                                        {roadmap.title}
                                                    </h3>
                                                    <Badge variant="muted" className="sm:hidden">{levelLabel}</Badge>
                                                </div>
                                                {roadmap.description && (
                                                    <p className="line-clamp-2 max-w-[72ch] text-sm text-muted-foreground">
                                                        {roadmap.description}
                                                    </p>
                                                )}
                                                <p className="flex items-center gap-1.5 pt-0.5 text-xs text-muted-foreground tabular">
                                                    <LuRoute className="size-3.5" aria-hidden="true" />
                                                    {nodeCount} {nodeCount === 1 ? 'step' : 'steps'}
                                                </p>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-3 self-center">
                                                <Badge variant="muted" className="max-sm:hidden">{levelLabel}</Badge>
                                                <LuChevronRight
                                                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                                                    aria-hidden="true"
                                                />
                                            </div>
                                        </Link>
                                    </li>
                                );
                            })}
                    </ul>
                )}
            </section>
        </div>
    );
}
