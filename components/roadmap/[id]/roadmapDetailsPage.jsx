'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouterActions } from '@/router/useRouterActions';
import { useQuery } from '@tanstack/react-query';
import { roadmapQueries } from '@/queries/roadmap.query';
import { levelMapping } from '@/constants/constants';
import { useApp } from '@/contexts/appContext';
import useViewport from '@/hooks/useViewport';

import { ErrorReload } from '@/components/ui/error';

import { Badge } from '@/components/shadcn/badge';
import { Button } from '@/components/shadcn/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/shadcn/dropdown-menu';
import { Kbd } from '@/components/shadcn/kbd';
import { Progress } from '@/components/shadcn/progress';
import { Separator } from '@/components/shadcn/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/shadcn/sheet';
import { Skeleton } from '@/components/shadcn/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/shadcn/tooltip';
import { cn } from '@/lib/utils';

import Node, { NODE_STATUS, NodeCourseList, StageMarker, getCourseProgress, getNodeProgress } from './items';

import {
    LuArrowLeft,
    LuArrowRight,
    LuCheck,
    LuChevronsUpDown,
    LuLink,
    LuMap,
    LuRotateCcw,
    LuRoute,
    LuX,
} from 'react-icons/lu';

// Nodes that share an order_index sit in the same stage of the path.
function groupStages(nodes) {
    return nodes.reduce((stages, node) => {
        const last = stages[stages.length - 1];
        if (last && node.order_index != null && last.order === node.order_index) {
            last.nodes.push(node);
        } else {
            stages.push({ order: node.order_index, nodes: [node] });
        }
        return stages;
    }, []);
}

function stageStatus(stage) {
    const statuses = stage.nodes.map((node) => getNodeProgress(node).status);
    if (statuses.every((status) => status === 'completed')) return 'completed';
    if (statuses.some((status) => status === 'completed' || status === 'in_progress')) return 'in_progress';
    return 'not_started';
}

function PathSkeleton() {
    return (
        <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 sm:px-6 lg:py-8">
            <div className="space-y-3">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
            </div>
            <Skeleton className="h-16 w-full" />
            <div className="space-y-6">
                {[0, 1, 2].map((index) => (
                    <div key={index} className="flex gap-4">
                        <Skeleton className="size-7 shrink-0 rounded-full" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-3 w-16" />
                            <Skeleton className="h-20 w-full rounded-lg" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function NodeDetailsPanel({ node, stepNumber, onClose = null }) {
    if (!node) {
        return (
            <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Select a step to see its courses.
            </div>
        );
    }

    const progress = getNodeProgress(node);
    const status = NODE_STATUS[progress.status];
    const nextCourse = progress.courses.find((course) => !getCourseProgress(course).isComplete) || progress.courses[0];
    const nextIsReview = nextCourse ? getCourseProgress(nextCourse).isComplete : false;

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b pr-2 pl-4">
                <h2 className="text-sm font-semibold">Step details</h2>
                {onClose && (
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        onClick={onClose}
                        aria-label="Close step details"
                    >
                        <LuX />
                    </Button>
                )}
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground tabular">Step {stepNumber}</span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                    </div>
                    <h3 className="text-lg leading-snug font-semibold tracking-tight text-foreground">{node.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {node.description || 'No description has been written for this step yet.'}
                    </p>
                </div>

                {progress.totalLessons > 0 && (
                    <div className="space-y-2 rounded-lg border bg-background px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs text-muted-foreground">Core lessons completed</span>
                            <span className="text-xs text-foreground tabular">
                                {progress.completedLessons}/{progress.totalLessons} &middot; {progress.percent}%
                            </span>
                        </div>
                        <Progress value={progress.percent} className="h-1.5 bg-muted" aria-label={`${node.title} progress`} />
                    </div>
                )}

                <NodeCourseList courses={progress.courses} />
            </div>

            {nextCourse?.id && (
                <div className="shrink-0 border-t p-4">
                    <Button asChild className="w-full">
                        <Link href={`/course/${nextCourse.id}`}>
                            {nextIsReview ? <LuRotateCcw /> : <LuArrowRight />}
                            <span className="truncate">
                                {nextIsReview ? 'Review' : 'Open'} {nextCourse.title}
                            </span>
                        </Link>
                    </Button>
                </div>
            )}
        </div>
    );
}

export default function RoadmapDetailsPage({ params, initialData = null }) {
    const { id } = params;
    const { navigate } = useRouterActions();
    const { showAlert } = useApp();
    const viewport = useViewport();
    const isCompact = viewport.width > 0 && viewport.width < 1024;
    const isMobile = viewport.width > 0 && viewport.width < 640;

    // Query roadmap details
    const { data: queryData, isLoading, isError, error, refetch } = useQuery({
        ...roadmapQueries.details(id),
        initialData: initialData ? { success: true, data: initialData } : undefined,
    });

    const roadmapData = queryData?.data || initialData || {};
    const nodes = roadmapData?.nodes || [];
    const allRoadmaps = roadmapData?.allRoadmaps || [];

    // Presentation state: which step the details panel shows, and whether
    // the details sheet is open on small screens.
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    const [detailsOpen, setDetailsOpen] = useState(false);

    // Leaving the compact layout closes the details sheet (adjusted during render, not in an effect).
    const [wasCompact, setWasCompact] = useState(isCompact);
    if (wasCompact !== isCompact) {
        setWasCompact(isCompact);
        if (!isCompact) setDetailsOpen(false);
    }

    const stages = groupStages(nodes);
    const nodeProgress = nodes.map((node) => getNodeProgress(node));
    const completedSteps = nodeProgress.filter((p) => p.status === 'completed').length;
    const totalSteps = nodes.length;
    const pathPercent = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const courseCount = new Set(
        nodes.flatMap((node) => (node.courses || []).map((course) => course.id)).filter(Boolean)
    ).size;

    // Default to the first step that still has work left.
    const nextUpIndex = nodeProgress.findIndex((p) => p.status === 'in_progress' || p.status === 'not_started');
    const defaultNode = nodes[nextUpIndex >= 0 ? nextUpIndex : 0] || null;
    const selectedNode = nodes.find((node) => node.id === selectedNodeId) || defaultNode;
    const selectedStepNumber = selectedNode
        ? stages.findIndex((stage) => stage.nodes.some((node) => node.id === selectedNode.id)) + 1
        : 0;

    const levelLabel = roadmapData?.level
        ? levelMapping[roadmapData.level.toLowerCase()]?.label || roadmapData.level
        : null;

    const handleSelectNode = (nodeId) => {
        setSelectedNodeId(nodeId);
        if (isCompact) setDetailsOpen(true);
    };

    // Arrow keys move focus along the path; Enter or Space opens the step.
    const handlePathKeyDown = (event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll('[data-roadmap-node]'));
        const index = buttons.indexOf(document.activeElement);
        if (index === -1 || buttons.length === 0) return;

        event.preventDefault();
        let next = index;
        if (event.key === 'ArrowDown') next = Math.min(index + 1, buttons.length - 1);
        if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = buttons.length - 1;
        buttons[next]?.focus();
    };

    // Copy share link
    const handleShare = async () => {
        if (typeof window === 'undefined') return;
        try {
            await navigator.clipboard.writeText(window.location.href);
            showAlert(200, 'Roadmap link copied to clipboard.');
        } catch {
            showAlert(500, 'Could not copy the link. Copy it from the address bar instead.');
        }
    };

    const showLoading = isLoading && !initialData;
    const showError = isError && !initialData;
    const hasNodes = !showLoading && !showError && nodes.length > 0;
    const title = roadmapData?.title || 'Roadmap';

    return (
        <div className="flex h-dvh w-full min-w-0 flex-col bg-background">
            {/* Workspace bar */}
            <header className="flex h-12 shrink-0 items-center gap-2 border-b px-2 sm:px-3">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" onClick={() => navigate({ path: '/roadmap' })} aria-label="Back to roadmaps">
                            <LuArrowLeft />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Back to roadmaps</TooltipContent>
                </Tooltip>

                <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />

                <div className="flex min-w-0 flex-1 items-center gap-2">
                    {showLoading ? (
                        <Skeleton className="h-4 w-48" />
                    ) : allRoadmaps.length > 1 ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="min-w-0 max-w-full justify-start px-2 data-[state=open]:bg-accent"
                                    aria-label={`${title}. Switch roadmap`}
                                >
                                    <span className="truncate font-semibold">{title}</span>
                                    <LuChevronsUpDown className="text-muted-foreground" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-72 max-w-[calc(100vw-2rem)]">
                                <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                                    Switch roadmap
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                {allRoadmaps.map((roadmap) => {
                                    const isCurrent = roadmap.id === id;
                                    const steps = parseInt(roadmap.nodes, 10) || 0;
                                    return (
                                        <DropdownMenuItem key={roadmap.id} asChild>
                                            <Link
                                                href={`/roadmap/${roadmap.id}`}
                                                aria-current={isCurrent ? 'page' : undefined}
                                                className="flex items-center gap-2"
                                            >
                                                <LuCheck className={isCurrent ? 'text-primary-ink' : 'invisible'} aria-hidden="true" />
                                                <span className="min-w-0 flex-1 truncate">{roadmap.title}</span>
                                                <span className="shrink-0 text-xs text-muted-foreground tabular">
                                                    {steps} {steps === 1 ? 'step' : 'steps'}
                                                </span>
                                            </Link>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <span className="truncate px-2 text-sm font-semibold">{title}</span>
                    )}

                    {hasNodes && (
                        <div className="ml-2 hidden shrink-0 items-center gap-2 md:flex">
                            <Progress value={pathPercent} className="h-1.5 w-28 bg-muted" aria-label="Roadmap progress" />
                            <span className="text-xs text-muted-foreground tabular">
                                {completedSteps}/{totalSteps} steps
                            </span>
                        </div>
                    )}
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleShare}
                    disabled={showLoading || showError}
                    className="text-muted-foreground hover:text-foreground"
                >
                    <LuLink />
                    <span className="max-sm:sr-only">Copy link</span>
                </Button>
            </header>

            <div className="flex min-h-0 flex-1">
                <main className="min-w-0 flex-1 overflow-y-auto">
                    {showLoading ? (
                        <PathSkeleton />
                    ) : showError ? (
                        <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
                            <ErrorReload data={error} refetch={() => refetch()} />
                        </div>
                    ) : (
                        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-6 sm:px-6 lg:py-8">
                            <section className="space-y-4" aria-labelledby="roadmap-title">
                                <div className="space-y-2">
                                    <h1 id="roadmap-title" className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                                        {title}
                                    </h1>
                                    {roadmapData?.description && (
                                        <p className="max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
                                            {roadmapData.description}
                                        </p>
                                    )}
                                </div>

                                <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
                                    {[
                                        { label: 'Level', value: levelLabel || 'All levels', mono: false },
                                        { label: 'Steps', value: totalSteps, mono: true },
                                        { label: 'Courses', value: courseCount, mono: true },
                                        { label: 'Completed', value: `${pathPercent}%`, mono: true },
                                    ].map((stat) => (
                                        <div key={stat.label} className="bg-card px-3 py-2.5">
                                            <dt className="text-xs text-muted-foreground">{stat.label}</dt>
                                            <dd className={stat.mono ? 'text-lg font-medium tabular' : 'text-base leading-7 font-medium'}>
                                                {stat.value}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            </section>

                            {hasNodes ? (
                                <section aria-labelledby="roadmap-path-heading" className="space-y-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <h2 id="roadmap-path-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            <LuRoute className="size-4 text-muted-foreground" aria-hidden="true" />
                                            Learning path
                                        </h2>
                                        <p className="hidden items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                                            <Kbd>Up</Kbd>
                                            <Kbd>Down</Kbd>
                                            to move between steps
                                        </p>
                                    </div>

                                    <ol className="list-none" onKeyDown={handlePathKeyDown}>
                                        {stages.map((stage, stageIndex) => {
                                            const isLast = stageIndex === stages.length - 1;
                                            const stepNumber = stageIndex + 1;

                                            return (
                                                <li key={`${stage.order ?? 'stage'}-${stageIndex}`} className="flex gap-3 sm:gap-4">
                                                    <div className="flex w-7 shrink-0 flex-col items-center">
                                                        <StageMarker status={stageStatus(stage)} number={stepNumber} />
                                                        {!isLast && <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />}
                                                    </div>

                                                    <div className={isLast ? 'min-w-0 flex-1' : 'min-w-0 flex-1 pb-6'}>
                                                        <p className="flex h-7 items-center gap-2 text-xs text-muted-foreground tabular">
                                                            Step {stepNumber}
                                                            {stage.nodes.length > 1 && (
                                                                <span className="font-sans">&middot; {stage.nodes.length} topics</span>
                                                            )}
                                                        </p>
                                                        <ul className="list-none space-y-2">
                                                            {stage.nodes.map((node) => (
                                                                <li key={node.id}>
                                                                    <Node
                                                                        data={node}
                                                                        isSelected={selectedNode?.id === node.id}
                                                                        handleNodeClick={() => handleSelectNode(node.id)}
                                                                    />
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </section>
                            ) : (
                                <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-14 text-center">
                                    <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                        <LuRoute className="size-5" aria-hidden="true" />
                                    </span>
                                    <div className="space-y-1">
                                        <h2 className="text-sm font-semibold">This roadmap has no steps yet</h2>
                                        <p className="max-w-[48ch] text-sm text-muted-foreground">
                                            Steps and their courses will appear here once they are added. Browse the other roadmaps in the meantime.
                                        </p>
                                    </div>
                                    <Button asChild size="sm" variant="outline">
                                        <Link href="/roadmap"><LuMap />All roadmaps</Link>
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </main>

                {hasNodes && (
                    <aside className="hidden w-96 shrink-0 border-l bg-sidebar lg:block xl:w-[26rem]" aria-label="Step details panel">
                        <NodeDetailsPanel node={selectedNode} stepNumber={selectedStepNumber} />
                    </aside>
                )}
            </div>

            {/* Step details on tablets and phones */}
            <Sheet open={isCompact && detailsOpen} onOpenChange={setDetailsOpen}>
                <SheetContent
                    side={isMobile ? 'bottom' : 'right'}
                    showCloseButton={false}
                    className={cn(
                        'gap-0 bg-sidebar p-0',
                        isMobile
                            ? 'max-h-[85vh] rounded-t-2xl border-t'
                            : 'w-[min(26rem,92vw)]'
                    )}
                    onCloseAutoFocus={(event) => {
                        // Opened from a step button, so return focus to it.
                        if (!selectedNode) return;
                        const trigger = document.querySelector(`[data-roadmap-node="${selectedNode.id}"]`);
                        if (trigger) {
                            event.preventDefault();
                            trigger.focus();
                        }
                    }}
                >
                    {isMobile && (
                        <div className="mx-auto my-2.5 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 sm:hidden" aria-hidden="true" />
                    )}
                    <SheetHeader className="sr-only">
                        <SheetTitle>Step details</SheetTitle>
                        <SheetDescription>Description, progress and courses for the selected step.</SheetDescription>
                    </SheetHeader>
                    <NodeDetailsPanel
                        node={selectedNode}
                        stepNumber={selectedStepNumber}
                        onClose={() => setDetailsOpen(false)}
                    />
                </SheetContent>
            </Sheet>
        </div>
    );
}
