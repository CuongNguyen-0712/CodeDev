'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useAdminUpdateChallenge } from "@/mutations/premium.mutation";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import StatusDot from "@/components/admin/ui/statusDot";
import { formatNumber } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import RowAction from "@/components/admin/ui/rowAction";
import ListSearch, { matches } from "@/components/admin/ui/listSearch";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";

import { LuPencil } from "react-icons/lu";

const STATUSES = [
    { value: "open", label: "Open" },
    { value: "coming_soon", label: "Coming soon" },
    { value: "closed", label: "Closed" },
];
const STATUS_DOT = { open: "completed", coming_soon: "queued", closed: "archived" };

/** Status, publishing and points of every challenge in one course (docs/admin-panel-plan.md 04). */
export default function ChallengeManager({ courseId }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const [editing, setEditing] = useState(null);
    const [draft, setDraft] = useState(null);
    const [search, setSearch] = useState("");
    const update = useAdminUpdateChallenge();
    const query = useQuery({
        queryKey: adminKeys.challenges(courseId),
        queryFn: () => adminClient.getChallenges(courseId),
        enabled: Boolean(courseId),
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    const open = (challenge) => {
        setEditing(challenge);
        setDraft({ status: challenge.status, isPublished: challenge.is_published, points: String(challenge.points ?? 0) });
    };

    if (!courseId) return null;
    if (query.isPending) return <TableSkeleton rows={6} columns={5} label="Loading challenges" />;
    if (query.isError) return <p className="text-sm">Couldn&apos;t load the challenges. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>;

    const all = query.data;
    const rows = all.filter((challenge) => matches(search, challenge.title, challenge.type, challenge.difficulty, challenge.lesson_title, challenge.status));
    return (
        <>
            {all.length > 0 && <ListSearch value={search} onChange={setSearch} label="Search challenges by title, lesson or type" shown={rows.length} total={all.length} noun="challenges" />}
            <div tabIndex={rows.length ? 0 : undefined} className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {rows.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{all.length ? `No challenge matches “${search.trim()}”.` : "This course has no challenges."}</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th scope="col" className="px-4 py-2 font-normal">Challenge</th>
                                <th scope="col" className="px-4 py-2 font-normal @max-2xl:hidden">Status</th>
                                <th scope="col" className="px-4 py-2 font-normal @max-2xl:hidden">Published</th>
                                <th scope="col" className="px-4 py-2 text-right font-normal">Points</th>
                                {can("challenge.update") && <th scope="col" className="w-0 px-4 py-2"><span className="sr-only">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {rows.map((challenge) => (
                                <tr key={challenge.id}>
                                    <td className="max-w-0 px-4 py-2.5">
                                        <span className="block truncate">{challenge.title}</span>
                                        <span className="block truncate text-xs text-muted-foreground"><span className="@2xl:hidden">{STATUSES.find((s) => s.value === challenge.status)?.label} · {challenge.is_published ? "published" : "hidden"} · </span>{challenge.type} · {challenge.difficulty}{challenge.lesson_title ? ` · ${challenge.lesson_title}` : ""}</span>
                                    </td>
                                    <td className="px-4 py-2.5 @max-2xl:hidden"><StatusDot status={STATUS_DOT[challenge.status]} label={STATUSES.find((s) => s.value === challenge.status)?.label} /></td>
                                    <td className="px-4 py-2.5 @max-2xl:hidden">{challenge.is_published ? <Badge variant="success">Published</Badge> : <Badge variant="muted">Hidden</Badge>}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(challenge.points)}</td>
                                    {can("challenge.update") && (
                                        <td className="px-4 py-2.5 text-right"><RowAction icon={LuPencil} label="Edit" target={challenge.title} tone="primary" onClick={() => open(challenge)} /></td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(editing)}
                onOpenChange={(value) => !value && setEditing(null)}
                title={editing ? `Change ${editing.title}` : ""}
                description="Learners see the new status at once. Points apply to rewards granted from now on."
                confirmLabel="Save changes"
                destructive={false}
                reasonLabel="Reason"
                minReason={10}
                validate={() => (draft && (!/^\d{1,5}$/.test(draft.points) || Number(draft.points) > 10000) ? "Points must be a whole number from 0 to 10,000." : null)}
                onConfirm={(reason) => update.mutate(
                    { challengeId: editing.id, status: draft.status, isPublished: draft.isPublished, points: Number(draft.points), reason },
                    {
                        onSuccess: () => { showAlert(200, "Challenge updated"); query.refetch(); },
                        onError: (error) => showAlert(error?.status || 500, error?.message || "The challenge was not updated"),
                    }
                )}
            >
                {draft && (
                    <div className="grid gap-4 @xl:grid-cols-3">
                        <Field>
                            <FieldLabel htmlFor="challenge-status">Status</FieldLabel>
                            <Select value={draft.status} onValueChange={(value) => setDraft({ ...draft, status: value })}>
                                <SelectTrigger id="challenge-status"><SelectValue /></SelectTrigger>
                                <SelectContent>{STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="challenge-published">Published</FieldLabel>
                            <Select value={draft.isPublished ? "yes" : "no"} onValueChange={(value) => setDraft({ ...draft, isPublished: value === "yes" })}>
                                <SelectTrigger id="challenge-published"><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent>
                            </Select>
                        </Field>
                        <Field>
                            <FieldLabel htmlFor="challenge-points">Points</FieldLabel>
                            <input
                                id="challenge-points"
                                inputMode="numeric"
                                value={draft.points}
                                onChange={(event) => setDraft({ ...draft, points: event.target.value })}
                                className="h-9 w-full rounded-md border border-input bg-background px-3 text-right text-sm tabular-nums focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            />
                        </Field>
                    </div>
                )}
            </ConfirmDialog>
        </>
    );
}
