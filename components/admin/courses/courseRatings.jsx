'use client';

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { LOW_RATING, MIN_RATINGS, RATE_PROMPT_LESSON } from "@/lib/ratingRules";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { useAdminSetRatingHidden } from "@/mutations/premium.mutation";
import BarChart from "@/components/admin/ui/barChart";
import Finding from "@/components/admin/ui/finding";
import RowAction from "@/components/admin/ui/rowAction";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import { formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";

import { LuEye, LuEyeOff, LuStar } from "react-icons/lu";

const starsLabel = (stars) => (stars === 1 ? "1 star" : `${stars} stars`);

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
                <div className="p-5">
                    <BarChart
                        data={data.histogram.map((row) => ({ label: starsLabel(row.stars), value: row.count }))}
                        label="Visible ratings by number of stars"
                        height={160}
                    />
                </div>
            </section>

            <div tabIndex={data.items.length ? 0 : undefined} className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {data.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{`No ratings yet. Learners are asked after lesson ${RATE_PROMPT_LESSON} and when they finish the course.`}</p>
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
                                        <span className="flex items-center gap-1 tabular-nums" title={`${starsLabel(item.stars)} out of 5`}>
                                            <LuStar className="size-3.5 text-xp fill-xp/20" aria-hidden="true" />
                                            {item.stars}
                                            <span className="sr-only">out of 5</span>
                                            {item.hidden && <Badge variant="muted" className="ml-1">Hidden</Badge>}
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
                    ? "The rating counts in the course average again."
                    : "The rating leaves the course average. The learner still sees their own stars and can change them."}
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
