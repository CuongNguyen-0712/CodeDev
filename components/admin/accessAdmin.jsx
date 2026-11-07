'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { useAdmin } from "@/components/admin/adminContext";
import { adminQueries } from "@/queries/premium.query";
import { newIdempotencyKey, useAdminAdjustExperience, useAdminAdjustPoints, useAdminGrant, useAdminRevoke } from "@/mutations/premium.mutation";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Textarea } from "@/components/shadcn/textarea";
import RowAction from "@/components/admin/ui/rowAction";
import { formatDate, formatNumber } from "@/components/admin/ui/format";
import { DateField, toLocalValue } from "@/components/admin/ui/dateField";

import { LuBan, LuCheck, LuSearch } from "react-icons/lu";
import { cn } from "@/lib/utils";

function Initial({ name, className }) {
    return (
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary-ink uppercase", className)} aria-hidden="true">
            {(name || "?").trim().slice(0, 1)}
        </span>
    );
}

const levelAndPoints = (user) => `Lv ${formatNumber(user.level || 1)} · ${formatNumber(user.points)} pts`;

/** The user picker: one card with the search field and the matches as rows, the picked one tinted. */
function UserPicker({ query, onQuery, users, selected, onSelect }) {
    const term = query.trim();
    const results = users.data || [];
    return (
        <section className="overflow-hidden rounded-lg border border-border bg-card" aria-labelledby="user-search-heading">
            <div className="space-y-2 border-b border-border p-3">
                <h2 id="user-search-heading" className="text-sm font-semibold">Find a user</h2>
                <div className="relative">
                    <LuSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Label htmlFor="admin-user-search" className="sr-only">Username, email or user id</Label>
                    <Input
                        id="admin-user-search"
                        type="search"
                        placeholder="Username, email or user id"
                        value={query}
                        onChange={(event) => onQuery(event.target.value)}
                        autoComplete="off"
                        spellCheck={false}
                        className="pl-8"
                    />
                </div>
            </div>
            <div aria-live="polite" aria-busy={users.isFetching}>
                {term.length < 2 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">Type at least 2 characters of a username or email, or paste a user id.</p>
                ) : users.isPending || (users.isFetching && results.length === 0) ? (
                    <div className="space-y-2 p-3">{[0, 1, 2].map((key) => <Skeleton key={key} className="h-10 w-full" />)}</div>
                ) : users.isError ? (
                    <p className="px-3 py-4 text-sm">Search failed. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => users.refetch()}>Retry</button></p>
                ) : results.length === 0 ? (
                    <p className="px-3 py-4 text-sm text-muted-foreground">No user matches “{term}”.</p>
                ) : (
                    <ul className="max-h-[26rem] list-none divide-y divide-border overflow-y-auto" aria-label="Matching users">
                        {results.map((user) => {
                            const picked = selected?.id === user.id;
                            return (
                                <li key={user.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSelect(user)}
                                        aria-pressed={picked}
                                        className={cn(
                                            "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors focus-visible:bg-muted focus-visible:outline-none",
                                            picked ? "bg-primary-soft" : "hover:bg-muted"
                                        )}
                                    >
                                        <Initial name={user.username} />
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">{user.username}</span>
                                            <span className="block truncate text-xs text-muted-foreground">{user.email || user.id}</span>
                                            <span className="block text-xs text-muted-foreground tabular-nums">{levelAndPoints(user)}</span>
                                        </span>
                                        {picked && <LuCheck aria-hidden="true" className="size-4 shrink-0 text-primary-ink" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
            {results.length >= 20 && <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">Showing the first 20. Type more to narrow it down.</p>}
        </section>
    );
}

export default function AccessAdmin() {
    const { can } = useAdmin();
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const users = useQuery(adminQueries.users(query));

    return (
        <div className="grid grid-cols-1 items-start gap-6 @3xl:grid-cols-[20rem_minmax(0,1fr)]">
            <UserPicker query={query} onQuery={setQuery} users={users} selected={selected} onSelect={setSelected} />

            {selected ? (
                <div className="min-w-0 space-y-6">
                    <header className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-4">
                        <Initial name={selected.username} className="size-10 text-base" />
                        <div className="min-w-0 flex-1">
                            <h2 className="truncate text-lg font-semibold">{selected.username}</h2>
                            <p className="truncate text-sm text-muted-foreground">{selected.email || "No email shown"} · <span className="font-mono text-xs">{selected.id}</span></p>
                        </div>
                        <p className="shrink-0 text-sm text-muted-foreground tabular-nums max-sm:hidden">{levelAndPoints(selected)}</p>
                    </header>
                    {can("points.adjust") && <AdjustBalance key={selected.id} kind="points" user={selected} onAdjusted={(points) => setSelected({ ...selected, points })} />}
                    {can("points.adjust") && <AdjustBalance key={`x-${selected.id}`} kind="exp" user={selected} onAdjusted={(exp) => setSelected({ ...selected, exp })} />}
                    {can("entitlement.grant") && <Entitlements key={`e-${selected.id}`} user={selected} />}
                </div>
            ) : (
                <p className="rounded-lg border border-dashed border-border px-5 py-10 text-center text-sm text-muted-foreground">
                    Pick a user to adjust their points and EXP or manage their course access.
                </p>
            )}
        </div>
    );
}

// Points can never go below 0 (the adjustment is refused); EXP is floored at 0 (and the level recomputed).
const BALANCE_KINDS = {
    points: { title: "Points", unit: "pts", field: "points", resultField: "balanceAfter", floors: false },
    exp: { title: "Experience (EXP)", unit: "EXP", field: "exp", resultField: "expAfter", floors: true },
};

function AdjustBalance({ kind, user, onAdjusted }) {
    const config = BALANCE_KINDS[kind];
    const { showAlert } = useApp();
    const adjustPoints = useAdminAdjustPoints();
    const adjustExperience = useAdminAdjustExperience();
    const adjust = kind === "exp" ? adjustExperience : adjustPoints;
    const [amount, setAmount] = useState("");
    const [reason, setReason] = useState("");
    // One key per form submission intent: a double click or a retry is applied once.
    const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

    const current = Number(user[config.field]) || 0;
    const value = Number.parseInt(amount, 10);
    const valid = Number.isInteger(value) && value !== 0 && reason.trim().length >= 5;
    const rawAfter = Number.isInteger(value) ? current + value : null;
    const after = rawAfter !== null && config.floors ? Math.max(0, rawAfter) : rawAfter;
    const blocked = !config.floors && after !== null && after < 0;
    const id = `adjust-${kind}`;

    const submit = (event) => {
        event.preventDefault();
        if (!valid || blocked) return;
        adjust.mutate(
            { userId: user.id, amount: value, reason: reason.trim(), idempotencyKey },
            {
                onSuccess: (result) => {
                    const next = result[config.resultField];
                    showAlert(200, result.replayed ? "Already applied" : `${config.title} is now ${next} ${config.unit}${kind === "exp" ? ` (level ${result.level})` : ""}`);
                    onAdjusted(next);
                    setAmount("");
                    setReason("");
                    setIdempotencyKey(newIdempotencyKey());
                },
                onError: (error) => showAlert(error?.status || 500, error?.message || "Adjustment failed"),
            }
        );
    };

    return (
        <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby={`${id}-heading`}>
            <h3 id={`${id}-heading`} className="text-sm font-semibold">{config.title}</h3>
            <p className="text-sm">Current: <span className="font-medium tabular-nums">{current.toLocaleString()} {config.unit}</span></p>
            <form onSubmit={submit} className="space-y-3">
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-amount`}>Amount (negative to deduct)</Label>
                    <Input id={`${id}-amount`} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ""))} className="w-40" />
                    {after !== null && (
                        <p className={blocked ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                            After: {after.toLocaleString()} {config.unit}
                            {blocked ? " (not allowed: balances never go below 0)" : ""}
                            {config.floors && rawAfter < 0 ? " (EXP never goes below 0)" : ""}
                        </p>
                    )}
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor={`${id}-reason`}>Reason (kept in the audit log)</Label>
                    <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="h-24 resize-none field-sizing-fixed" />
                </div>
                <Button type="submit" disabled={!valid || adjust.isPending || blocked}>
                    {adjust.isPending ? "Applying..." : "Apply adjustment"}
                </Button>
            </form>
        </section>
    );
}

function Entitlements({ user }) {
    const { showAlert } = useApp();
    const entitlements = useQuery(adminQueries.entitlements(user.id));
    const courses = useQuery(adminQueries.courses());
    const grant = useAdminGrant();
    const revoke = useAdminRevoke();
    const [courseId, setCourseId] = useState("");
    const [expiresAt, setExpiresAt] = useState("");
    const [reason, setReason] = useState("");
    const [revoking, setRevoking] = useState(null);

    const fail =(error) => showAlert(error?.status || 500, error?.message || "Request failed");

    const submitGrant = (event) => {
        event.preventDefault();
        grant.mutate(
            {
                userId: user.id,
                courseId,
                reason: reason.trim(),
                ...(expiresAt ? { expiresAt: new Date(`${expiresAt}T23:59:59`).toISOString() } : {}),
            },
            {
                onSuccess: () => { showAlert(200, "Access granted"); setReason(""); setExpiresAt(""); },
                onError: fail,
            }
        );
    };


    return (
        <section className="space-y-3 rounded-lg border border-border p-4" aria-labelledby="access-heading">
            <h3 id="access-heading" className="text-sm font-semibold">Course access</h3>
            {entitlements.isPending ? <Skeleton className="h-20 w-full" /> : entitlements.isError ? (
                <p className="text-sm text-destructive">Could not load access. <button type="button" className="underline" onClick={() => entitlements.refetch()}>Retry</button></p>
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Course</TableHead>
                            <TableHead className="@max-2xl:hidden">Source</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="@max-2xl:hidden">Expires</TableHead>
                            <TableHead><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entitlements.data.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-muted-foreground">No course access yet. Grant a course with the form below.</TableCell></TableRow>
                        )}
                        {entitlements.data.map((e) => (
                            <TableRow key={e.id}>
                                <TableCell>{e.title}</TableCell>
                                <TableCell className="@max-2xl:hidden">{e.source}</TableCell>
                                <TableCell><Badge variant={e.status === "active" ? "success" : "muted"}>{e.status}</Badge></TableCell>
                                <TableCell className="@max-2xl:hidden">{formatDate(e.expires_at)}</TableCell>
                                <TableCell className="text-right">
                                    {e.status === "active" && (
                                        <RowAction icon={LuBan} label="Revoke" target={e.title} tone="danger" disabled={revoke.isPending} onClick={() => setRevoking(e)} />
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <form onSubmit={submitGrant} className="grid grid-cols-1 gap-3 @xl:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="grant-course">Grant access to</Label>
                    <Select value={courseId || undefined} onValueChange={setCourseId}>
                        <SelectTrigger id="grant-course" className="w-full"><SelectValue placeholder="Choose a course" /></SelectTrigger>
                        <SelectContent>
                            {(courses.data?.courses || []).filter((c) => c.publishStatus !== "archived").map((c) => (
                                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="grant-expiry">Expires on (optional)</Label>
                    <DateField id="grant-expiry" value={expiresAt} onChange={setExpiresAt} min={toLocalValue(new Date(), false)} clearable placeholder="No end date" presets={[{ label: "30 days", days: 30 }, { label: "90 days", days: 90 }, { label: "1 year", days: 365 }]} />
                </div>
                <div className="space-y-1.5 @xl:col-span-2">
                    <Label htmlFor="grant-reason">Reason</Label>
                    <Textarea id="grant-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="h-24 resize-none field-sizing-fixed" />
                </div>
                <div className="@xl:col-span-2">
                    <Button type="submit" disabled={!courseId || reason.trim().length < 5 || grant.isPending}>
                        {grant.isPending ? "Granting..." : "Grant access"}
                    </Button>
                </div>
            </form>

            <ConfirmDialog
                open={Boolean(revoking)}
                onOpenChange={(open) => !open && setRevoking(null)}
                title="Revoke course access?"
                description={`${user.username} loses access to "${revoking?.title}" immediately.`}
                confirmLabel="Revoke access"
                reasonLabel="Reason for revoking"
                onConfirm={(why) => revoke.mutate({ entitlementId: revoking.id, reason: why }, { onSuccess: () => showAlert(200, "Access revoked"), onError: fail })}
            />
        </section>
    );
}
