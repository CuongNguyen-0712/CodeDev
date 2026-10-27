'use client';

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { adminQueries } from "@/queries/premium.query";
import { newIdempotencyKey, useAdminAdjustExperience, useAdminAdjustPoints, useAdminGrant, useAdminRevoke } from "@/mutations/premium.mutation";

import { ConfirmDialog } from "@/components/admin/confirmDialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/shadcn/table";
import { Textarea } from "@/components/shadcn/textarea";

const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "-");

export default function AccessAdmin({ can }) {
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const users = useQuery(adminQueries.users(query));

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
            <section className="space-y-3" aria-labelledby="user-search-heading">
                <h2 id="user-search-heading" className="text-sm font-semibold">Find a user</h2>
                <Label htmlFor="admin-user-search" className="sr-only">Username, email or user id</Label>
                <Input
                    id="admin-user-search"
                    placeholder="Username, email or user id"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    autoComplete="off"
                />
                <ul className="space-y-1" aria-live="polite">
                    {users.isFetching && <li><Skeleton className="h-9 w-full" /></li>}
                    {users.isError && <li className="text-sm text-destructive">Search failed, try again.</li>}
                    {users.data?.length === 0 && query.trim().length >= 2 && <li className="text-sm text-muted-foreground">No user found.</li>}
                    {(users.data || []).map((user) => (
                        <li key={user.id}>
                            <button
                                type="button"
                                onClick={() => setSelected(user)}
                                aria-pressed={selected?.id === user.id}
                                className="w-full rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent aria-pressed:border-primary"
                            >
                                <span className="block font-medium">{user.username}</span>
                                <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </section>

            {selected ? (
                <div className="space-y-6">
                    <header>
                        <h2 className="text-lg font-semibold">{selected.username}</h2>
                        <p className="font-mono text-xs text-muted-foreground">{selected.id}</p>
                    </header>
                    {can("points.adjust") && <AdjustBalance key={selected.id} kind="points" user={selected} onAdjusted={(points) => setSelected({ ...selected, points })} />}
                    {can("points.adjust") && <AdjustBalance key={`x-${selected.id}`} kind="exp" user={selected} onAdjusted={(exp) => setSelected({ ...selected, exp })} />}
                    {can("entitlement.grant") && <Entitlements key={`e-${selected.id}`} user={selected} />}
                </div>
            ) : (
                <p className="text-sm text-muted-foreground">Pick a user to adjust points or manage course access.</p>
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
            <p className="text-sm">Current: <span className="font-mono tabular-nums">{current.toLocaleString()} {config.unit}</span></p>
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
                    <Textarea id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
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
                            <TableHead>Source</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Expires</TableHead>
                            <TableHead><span className="sr-only">Actions</span></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {entitlements.data.length === 0 && (
                            <TableRow><TableCell colSpan={5} className="text-muted-foreground">No course access.</TableCell></TableRow>
                        )}
                        {entitlements.data.map((e) => (
                            <TableRow key={e.id}>
                                <TableCell>{e.title}</TableCell>
                                <TableCell>{e.source}</TableCell>
                                <TableCell><Badge variant={e.status === "active" ? "success" : "muted"}>{e.status}</Badge></TableCell>
                                <TableCell>{formatDate(e.expires_at)}</TableCell>
                                <TableCell className="text-right">
                                    {e.status === "active" && (
                                        <Button size="sm" variant="outline" disabled={revoke.isPending} onClick={() => setRevoking(e)}>Revoke</Button>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}

            <form onSubmit={submitGrant} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                    <Label htmlFor="grant-course">Grant access to</Label>
                    <select
                        id="grant-course"
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={courseId}
                        onChange={(e) => setCourseId(e.target.value)}
                    >
                        <option value="">Choose a course</option>
                        {(courses.data?.courses || []).filter((c) => c.publishStatus !== "archived").map((c) => (
                            <option key={c.id} value={c.id}>{c.title}</option>
                        ))}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="grant-expiry">Expires on (optional)</Label>
                    <Input id="grant-expiry" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="grant-reason">Reason</Label>
                    <Textarea id="grant-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
                </div>
                <div className="sm:col-span-2">
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
