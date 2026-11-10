'use client';

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { LOW_RATING, MILESTONE_LABEL, MIN_RATINGS } from "@/lib/ratingRules";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { useAdminSetRatingHidden } from "@/mutations/premium.mutation";
import BarChart from "@/components/admin/ui/barChart";
import HBar from "@/components/admin/ui/hBar";
import Finding from "@/components/admin/ui/finding";
import RowAction from "@/components/admin/ui/rowAction";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import { formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";

import { LuEye, LuEyeOff, LuStar } from "react-icons/lu";

const starsLabel = (stars) => (stars === 1 ? "1 star" : `${stars} stars`);
const weekLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** One-line reading of the ratings, in the words the Overview findings use. */
function ratingFinding(data) {
    if (!data.count) return data.hidden ? `No visible rating · ${formatNumber(data.hidden)} hidden.` : "No learner has rated this course yet.";
    const average = Number(data.average).toFixed(2);
    const recent = data.recent.count ? ` · last 30 days ${Number(data.recent.average).toFixed(2)} from ${formatNumber(data.recent.count)}` : "";
    const hidden = data.hidden ? ` · ${formatNumber(data.hidden)} hidden` : "";
    const text = `${average} out of 5 from ${formatNumber(data.count)} rating${data.count === 1 ? "" : "s"}${recent}${hidden}.`;
    // Shown to learners from MIN_RATINGS on; a low average with enough ratings needs a look.
    if (data.count >= LOW_RATING.minRatings && data.average < LOW_RATING.below) return <Finding tone="attention">{text}</Finding>;
    return data.count < MIN_RATINGS ? `${text} Learners see it from ${MIN_RATINGS} ratings.` : text;
}

/** Learners' ratings of one course: average, 1-5 distribution, and hiding a rating (docs/admin-panel-plan.md 12.5). */
export default function CourseRatings({ courseId }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [target, setTarget] = useState(null);
    const setHidden = useAdminSetRatingHidden();
    const query = useQuery({
        queryKey: adminKeys.ratings(courseId),
        queryFn: () => adminClient.getCourseRatings(courseId),
        enabled: Boolean(courseId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    if (query.isPending) return <TableSkeleton rows={5} columns={4} label="Loading ratings" />;
    if (query.isError) return <p className="text-sm">Couldn&apos;t load the ratings. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>;

    const data = query.data;
    return (
        <div className="space-y-4">
            <section className="rounded-lg border border-border bg-card" aria-labelledby="course-ratings-heading">
                <header className="border-b border-border px-5 py-3">
                    <h2 id="course-ratings-heading" className="text-sm font-semibold">Ratings</h2>
                    <p className="text-xs text-muted-foreground">{ratingFinding(data)}</p>
                </header>
                <div className="grid gap-6 p-5 @3xl:grid-cols-2">
                    <div className="min-w-0">
                        <h3 className="mb-3 text-xs text-muted-foreground">Visible ratings by stars</h3>
                        <HBar
                            rows={[...data.histogram].reverse().map((row) => ({
                                key: row.stars,
                                label: starsLabel(row.stars),
                                value: row.count,
                                detail: data.count ? `${Math.round((row.count / data.count) * 100)}%` : null,
                            }))}
                            label="Visible ratings by number of stars"
                        />
                    </div>
                    <div className="min-w-0">
                        <h3 className="mb-1 text-xs text-muted-foreground">Ratings given or changed per week, last 12 weeks</h3>
                        <BarChart
                            data={(data.weekly || []).map((row) => ({ label: row.week, value: row.count }))}
                            label="Visible ratings given or changed per week, last 12 weeks"
                            height={150}
                            unit="weeks"
                            formatLabel={weekLabel}
                        />
                    </div>
                </div>
            </section>

            <div tabIndex={data.items.length ? 0 : undefined} className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {data.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No ratings yet. Learners are asked at 20% and 50% of the course and when they finish it.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th scope="col" className="px-4 py-2 font-normal">Learner</th>
                                <th scope="col" className="px-4 py-2 font-normal">Stars</th>
                                <th scope="col" className="px-4 py-2 font-normal @max-2xl:hidden">Updated</th>
                                <th scope="col" className="w-0 px-4 py-2"><span className="sr-only">Actions</span></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {data.items.map((item) => (
                                <tr key={item.user_id}>
                                    <td className="max-w-0 px-4 py-2.5">
                                        {can("user.read")
                                            ? <Link href={`/admin/users/${encodeURIComponent(item.user_id)}`} className="block truncate hover:underline">{item.username}</Link>
                                            : <span className="block truncate">{item.username}</span>}
                                        {item.hidden && <span className="text-xs text-muted-foreground">Hidden: not in the average</span>}
                                    </td>
                                    <td className="px-4 py-2.5">
                                        {/* Each milestone the learner rated, the latest (the one in the average) last. */}
                                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                                            {(item.milestones || [{ milestone: null, stars: item.stars }]).map((m) => (
                                                <span key={m.milestone ?? "stars"} className="flex items-center gap-1" title={`${m.milestone ? `${MILESTONE_LABEL[m.milestone]}: ` : ""}${starsLabel(m.stars)} out of 5`}>
                                                    {m.milestone && <span className="text-xs text-muted-foreground">{MILESTONE_LABEL[m.milestone]}</span>}
                                                    <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                                                    {m.stars}
                                                    <span className="sr-only">out of 5</span>
                                                </span>
                                            ))}
                                            {item.hidden && <Badge variant="muted">Hidden</Badge>}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-muted-foreground @max-2xl:hidden">{formatRelative(item.updated_at)}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <RowAction
                                            icon={item.hidden ? LuEye : LuEyeOff}
                                            label={item.hidden ? "Show" : "Hide"}
                                            target={`the rating of ${item.username}`}
                                            tone={item.hidden ? "primary" : "danger"}
                                            onClick={() => setTarget(item)}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(target)}
                onOpenChange={(value) => !value && setTarget(null)}
                title={target ? `${target.hidden ? "Show" : "Hide"} the rating of ${target.username}` : ""}
                description={target?.hidden
                    ? "Their ratings count in the course average again."
                    : "All of this learner's milestone ratings leave the course average. They still see their own stars and can change them."}
                confirmLabel={target?.hidden ? "Show rating" : "Hide rating"}
                destructive={!target?.hidden}
                reasonLabel="Reason"
                minReason={10}
                onConfirm={(reason) => setHidden.mutate(
                    { courseId, userId: target.user_id, hidden: !target.hidden, reason },
                    {
                        onSuccess: () => { showAlert(200, target.hidden ? "Rating shown" : "Rating hidden"); query.refetch(); },
                        onError: (error) => showAlert(error?.status || 500, error?.message || "The rating was not changed"),
                    }
                )}
            />
        </div>
    );
}
