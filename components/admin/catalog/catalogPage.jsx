'use client';

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding, { plural } from "@/components/admin/ui/finding";
import TabBar from "@/components/admin/ui/tabBar";
import ListSearch, { matches } from "@/components/admin/ui/listSearch";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { formatNumber } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Skeleton } from "@/components/shadcn/skeleton";
import RowAction from "@/components/admin/ui/rowAction";

import { LuEye, LuEyeOff, LuPencil, LuTrash2 } from "react-icons/lu";

const KINDS = [
    { key: "category", label: "Categories", singular: "category" },
    { key: "language", label: "Languages", singular: "language" },
    { key: "skill", label: "Skills", singular: "skill" },
    { key: "career_role", label: "Career roles", singular: "career role" },
    { key: "industry", label: "Industries", singular: "industry" },
    { key: "learning_goal", label: "Learning goals", singular: "learning goal" },
];
const inputClass = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** Catalog reference data (docs/admin-panel-plan.md 03): add, rename, deactivate, delete when unused. */
export default function CatalogPage() {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const queryClient = useQueryClient();
    const [{ kind, q }, update] = useUrlFilters({ kind: KINDS.map((item) => item.key), q: 100 }, { kind: "category" });
    const [dialog, setDialog] = useState(null);
    const [form, setForm] = useState({ name: "", code: "" });
    const meta = KINDS.find((item) => item.key === kind);
    const editable = can("catalog.update");

    const query = useQuery({ queryKey: [...adminKeys.all, "catalog", kind], queryFn: () => adminClient.getCatalog(kind), ...QUERY_TIMES.live, retry: retryTransient });
    const write = useMutation({
        mutationFn: ({ action, ...input }) => (action === "create" ? adminClient.createCatalogItem(input)
            : action === "delete" ? adminClient.deleteCatalogItem(input) : adminClient.updateCatalogItem(input)),
        onSettled: () => queryClient.invalidateQueries({ queryKey: adminKeys.all }),
    });

    const open = (next) => {
        setForm({ name: next.item?.name || "", code: "" });
        setDialog(next);
    };
    const run = (input, message) => write.mutate(input, {
        onSuccess: () => showAlert(200, message),
        onError: (error) => showAlert(error?.status || 500, error?.message || "The change was not saved"),
    });
    const coded = query.data?.coded;
    const unused = query.data ? query.data.items.filter((item) => item.courses === 0).length : null;
    const items = query.data ? query.data.items.filter((item) => matches(q, item.name, item.code)) : [];

    return (
        <>
            <PageHeader
                title="Catalog"
                description={unused == null ? "Reference lists used by courses, filters and onboarding."
                    : unused ? <Finding tone="attention">{`${plural(unused, meta.singular, meta.label.toLowerCase())} not used by any course and can be deleted.`}</Finding>
                    : <Finding tone="good">{`Every one of the ${plural(query.data.items.length, meta.singular, meta.label.toLowerCase())} is used by a course.`}</Finding>}
                actions={editable && <Button onClick={() => open({ action: "create" })}>Add {meta.singular}</Button>}
            />
            <TabBar tabs={KINDS} value={kind} onChange={(key) => update({ kind: key, q: "" })} label="Catalog lists" />
            {query.data?.items.length > 0 && (
                <ListSearch value={q} onChange={(value) => update({ q: value })} label={`Search ${meta.label.toLowerCase()}`} shown={items.length} total={query.data.items.length} noun={meta.label.toLowerCase()} delay={300} />
            )}

            <section tabIndex={0} className="overflow-x-auto rounded-lg border border-border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label={meta.label} aria-busy={query.isPending}>
                {query.isPending ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-7 w-full" />)}</div>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the list. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : query.data.items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Nothing in this list yet.</p>
                ) : items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No {meta.singular} matches “{q.trim()}”.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th scope="col" className="px-4 py-2 font-normal">Name</th>
                                {coded && <th scope="col" className="px-4 py-2 font-normal @max-2xl:hidden">Code</th>}
                                {coded && <th scope="col" className="px-4 py-2 font-normal @max-2xl:hidden">State</th>}
                                <th scope="col" className="px-4 py-2 text-right font-normal">Courses</th>
                                {editable && <th scope="col" className="px-4 py-2"><span className="sr-only">Actions</span></th>}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {items.map((item) => (
                                <tr key={item.id}>
                                    <td className="max-w-0 truncate px-3 py-2 sm:px-4">{item.name}</td>
                                    {coded && <td className="px-4 py-2 font-mono text-xs @max-2xl:hidden">{item.code}</td>}
                                    {coded && <td className="px-4 py-2 text-muted-foreground @max-2xl:hidden">{item.is_active ? "Active" : "Inactive"}</td>}
                                    <td className="px-4 py-2 text-right tabular-nums">{item.courses === 0 ? <Badge variant="warning">Unused</Badge> : formatNumber(item.courses)}</td>
                                    {editable && (
                                        <td className="px-4 py-2 text-right whitespace-nowrap">
                                            <RowAction icon={LuPencil} label="Rename" target={item.name} onClick={() => open({ action: "rename", item })} />
                                            {coded && <RowAction icon={item.is_active ? LuEyeOff : LuEye} label={item.is_active ? "Deactivate" : "Activate"} target={item.name} tone={item.is_active ? "warning" : "primary"} onClick={() => open({ action: item.is_active ? "deactivate" : "activate", item })} />}
                                            {item.courses === 0 && <RowAction icon={LuTrash2} label="Delete" target={item.name} tone="danger" onClick={() => open({ action: "delete", item })} />}
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            <ConfirmDialog
                open={Boolean(dialog)}
                onOpenChange={(value) => !value && setDialog(null)}
                title={!dialog ? "" : dialog.action === "create" ? `Add ${meta.singular}`
                    : dialog.action === "rename" ? `Rename ${dialog.item.name}`
                        : `${dialog.action.charAt(0).toUpperCase()}${dialog.action.slice(1)} ${dialog.item.name}?`}
                description={dialog?.action === "delete" ? "No course uses it. This cannot be undone."
                    : dialog?.action === "deactivate" ? "Hidden from new choices; courses that use it keep it." : "Changes appear in filters within a few minutes."}
                confirmLabel={dialog?.action === "create" ? "Add" : dialog?.action === "rename" ? "Save" : dialog?.action ? dialog.action.charAt(0).toUpperCase() + dialog.action.slice(1) : ""}
                destructive={dialog?.action === "delete"}
                reasonLabel="Reason"
                validate={() => {
                    if (["create", "rename"].includes(dialog?.action) && !form.name.trim()) return "Enter a name.";
                    if (dialog?.action === "create" && coded && !/^[a-z0-9_]{2,60}$/.test(form.code.trim())) return "The code uses lower-case letters, digits and _ (2-60).";
                    return null;
                }}
                onConfirm={(reason) => {
                    const { action, item } = dialog;
                    if (action === "create") run({ action, kind, name: form.name.trim(), code: coded ? form.code.trim() : undefined, reason }, "Added");
                    else if (action === "rename") run({ action, kind, id: item.id, name: form.name.trim(), reason }, "Renamed");
                    else if (action === "delete") run({ action, kind, id: item.id, reason }, "Deleted");
                    else run({ action, kind, id: item.id, isActive: action === "activate", reason }, action === "activate" ? "Activated" : "Deactivated");
                }}
            >
                {["create", "rename"].includes(dialog?.action) && (
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field>
                            <FieldLabel htmlFor="catalog-name">Name</FieldLabel>
                            <input id="catalog-name" value={form.name} maxLength={120} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} />
                        </Field>
                        {dialog?.action === "create" && coded && (
                            <Field>
                                <FieldLabel htmlFor="catalog-code">Code</FieldLabel>
                                <input id="catalog-code" value={form.code} maxLength={60} onChange={(event) => setForm({ ...form, code: event.target.value })} className={`${inputClass} font-mono`} />
                            </Field>
                        )}
                    </div>
                )}
            </ConfirmDialog>
        </>
    );
}
