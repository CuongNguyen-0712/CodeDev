'use client';

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import ChallengeManager from "@/components/admin/challenges/challengeManager";
import CourseRatings from "@/components/admin/courses/courseRatings";
import CommentList from "@/components/admin/feedback/commentList";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import TabBar from "@/components/admin/ui/tabBar";
import { formatNumber } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";
import RowAction from "@/components/admin/ui/rowAction";
import { cn } from "@/lib/utils";

import { LuArrowDown, LuArrowUp, LuCheck, LuExternalLink, LuEye, LuEyeOff, LuTriangleAlert } from "react-icons/lu";

const TABS = [
    { key: "structure", label: "Structure" },
    { key: "challenges", label: "Challenges" },
    { key: "feedback", label: "Feedback", permission: "comment.moderate" },
];

function MoveButtons({ disabledUp, disabledDown, onMove, label }) {
    return (
        <span className="flex">
            <Button variant="ghost" size="icon" className="size-8" disabled={disabledUp} onClick={() => onMove("up")} aria-label={`Move ${label} up`}><LuArrowUp aria-hidden="true" /></Button>
            <Button variant="ghost" size="icon" className="size-8" disabled={disabledDown} onClick={() => onMove("down")} aria-label={`Move ${label} down`}><LuArrowDown aria-hidden="true" /></Button>
        </span>
    );
}

function Checklist({ items }) {
    const open = items.filter((item) => !item.ok).length;
    return (
        <section className="rounded-lg border border-border bg-card" aria-label="Publish checklist">
            <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-3">
                <div>
                    <h2 className="text-sm font-semibold">Publish checklist</h2>
                    <p className="text-xs text-muted-foreground">{open ? "Warnings don't block publishing, except a premium course without a price." : "Every check passes."}</p>
                </div>
                {open ? <Badge variant="warning">{open} to fix</Badge> : <Badge variant="success">Ready</Badge>}
            </header>
            <ul className="space-y-2 p-5">
                {items.map((item) => (
                    <li key={item.key} className="flex items-start gap-2 text-sm">
                        {item.ok
                            ? <LuCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
                            : <LuTriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />}
                        <span>{item.label}<span className="sr-only">{item.ok ? " (done)" : " (warning)"}</span></span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default function CourseDetail({ courseId }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const queryClient = useQueryClient();
    const [tab, setTab] = useState("structure");
    const [pending, setPending] = useState(null);
    const query = useQuery({
        queryKey: [...adminKeys.courses(), courseId, "structure"],
        queryFn: () => adminClient.getCourseStructure(courseId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    const change = useMutation({
        mutationFn: (input) => adminClient.changeCourseStructure({ courseId, ...input }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    });
    const editable = can("catalog.update");

    if (query.isPending) return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-80" /><Skeleton className="h-64 w-full rounded-lg" /></div>;
    if (query.isError || !query.data) {
        return <><PageHeader title="Course" /><p className="rounded-lg border border-border p-4 text-sm">Couldn&apos;t load this course. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p></>;
    }

    const course = query.data;
    const lessons = course.modules.reduce((sum, module) => sum + module.lessons.length, 0);
    const openChecks = (course.checklist || []).filter((item) => !item.ok).length;
    const request = (input, label) => setPending({ input, label });

    return (
        <>
            <PageHeader title={course.title} description={<Finding tone={openChecks ? "attention" : "good"}>{`${openChecks ? `${openChecks} publish check${openChecks === 1 ? "" : "s"} open` : "Ready to publish"} · ${formatNumber(course.modules.length)} modules · ${formatNumber(lessons)} lessons · ${course.access_model} · ${course.level || "no level"}`}</Finding>}>
                <StatusDot status={course.publish_status} />
            </PageHeader>

            <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
                <div className="min-w-0">
                    <TabBar tabs={TABS.filter((item) => !item.permission || can(item.permission))} value={tab} onChange={setTab} label="Course sections" />
                    {tab === "challenges" ? <ChallengeManager courseId={courseId} /> : tab === "feedback" ? <div className="space-y-6"><CourseRatings courseId={courseId} /><CommentList courseId={courseId} /></div> : (
                        <div className="space-y-4">
                            {course.modules.length === 0 && <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">This course has no module yet. Modules and lessons come from the content seeds.</p>}
                            {course.modules.map((module, moduleIndex) => (
                                <section key={module.id} className="overflow-hidden rounded-lg border border-border bg-card" aria-label={module.title}>
                                    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
                                        <span className="min-w-0">
                                            <span className="block truncate text-sm font-semibold">{moduleIndex + 1}. {module.title}</span>
                                            {module.hidden && <span className="text-xs text-muted-foreground">Hidden from learners</span>}
                                        </span>
                                        {editable && (
                                            <span className="flex shrink-0 items-center">
                                                <MoveButtons label={module.title} disabledUp={moduleIndex === 0} disabledDown={moduleIndex === course.modules.length - 1}
                                                    onMove={(move) => request({ kind: "module", itemId: module.id, move }, `Move module “${module.title}” ${move}`)} />
                                                <RowAction icon={module.hidden ? LuEye : LuEyeOff} label={module.hidden ? "Show" : "Hide"} target={module.title} onClick={() => request({ kind: "module", itemId: module.id, hidden: !module.hidden }, `${module.hidden ? "Show" : "Hide"} module “${module.title}”`)} />
                                            </span>
                                        )}
                                    </header>
                                    <ol className="divide-y divide-border">
                                        {module.lessons.map((lesson, lessonIndex) => (
                                            <li key={lesson.id} className="flex flex-col gap-1 px-4 py-2 @xl:flex-row @xl:items-center @xl:justify-between @xl:gap-3">
                                                <span className="min-w-0">
                                                    <span className={cn("block truncate text-sm", lesson.hidden && "text-muted-foreground line-through")}>{lessonIndex + 1}. {lesson.title}</span>
                                                    <span className="block text-xs text-muted-foreground">
                                                        {lesson.contentType || "lesson"} · {formatNumber(lesson.challenges)} challenge{lesson.challenges === 1 ? "" : "s"}
                                                        {lesson.codingWithoutTests > 0 && <span className="text-warning"> · {lesson.codingWithoutTests} without tests</span>}
                                                        {!lesson.contentSource && <span className="text-warning"> · no content</span>}
                                                    </span>
                                                </span>
                                                <span className="-ml-2 flex shrink-0 items-center @xl:ml-0">
                                                    {lesson.contentSource && can("content.studio") && (
                                                        <a href={`/studio/structure/lesson;${encodeURIComponent(lesson.contentSource)}`} className="mr-1 inline-flex items-center gap-1 text-xs text-primary-ink hover:underline">
                                                            Studio<LuExternalLink aria-hidden="true" className="size-3" />
                                                        </a>
                                                    )}
                                                    {editable && (
                                                        <>
                                                            <MoveButtons label={lesson.title} disabledUp={lessonIndex === 0} disabledDown={lessonIndex === module.lessons.length - 1}
                                                                onMove={(move) => request({ kind: "lesson", itemId: lesson.id, move }, `Move lesson “${lesson.title}” ${move}`)} />
                                                            <RowAction icon={lesson.hidden ? LuEye : LuEyeOff} label={lesson.hidden ? "Show" : "Hide"} target={lesson.title} onClick={() => request({ kind: "lesson", itemId: lesson.id, hidden: !lesson.hidden }, `${lesson.hidden ? "Show" : "Hide"} lesson “${lesson.title}”`)} />
                                                        </>
                                                    )}
                                                </span>
                                            </li>
                                        ))}
                                    </ol>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
                <aside className="space-y-4">
                    <Checklist items={course.checklist} />
                    <p className="text-xs text-muted-foreground">Status, price and metadata are edited on Courses (Manage). Lesson text is edited in the studio.</p>
                </aside>
            </div>

            <ConfirmDialog
                open={Boolean(pending)}
                onOpenChange={(open) => !open && setPending(null)}
                title={pending ? `${pending.label}?` : ""}
                description={`${pending?.input.hidden === true
                    ? "Learners stop seeing it in the syllabus and the course player, cannot open it, and no longer need it to complete the course. Their progress on it is kept for when it is shown again. "
                    : pending?.input.hidden === false
                        ? "Learners see it again; anyone already past it gets it unlocked and needs it to complete the course. "
                        : ""}Cached course pages update within a couple of minutes.`}
                confirmLabel="Save"
                destructive={false}
                reasonLabel="Reason"
                onConfirm={(reason) => change.mutate({ ...pending.input, reason }, {
                    onSuccess: () => showAlert(200, "Saved"),
                    onError: (error) => showAlert(error?.status || 500, error?.message || "The change was not saved"),
                })}
            />
        </>
    );
}
