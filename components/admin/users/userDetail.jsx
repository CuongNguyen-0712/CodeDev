'use client';

import Link from "next/link";
import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { adminQueries } from "@/queries/premium.query";
import { useAdminChangeUserRole, useAdminRevokeUserSessions, useAdminSetUserStatus } from "@/mutations/premium.mutation";
import { useApp } from "@/contexts/appContext";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import { useAdmin } from "@/components/admin/adminContext";
import { ConfirmDialog } from "@/components/admin/confirmDialog";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import { DateField } from "@/components/admin/ui/dateField";
import { formatDate, formatDateTime, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Button } from "@/components/shadcn/button";
import { Field, FieldLabel } from "@/components/shadcn/field";
import { Skeleton } from "@/components/shadcn/skeleton";
import { cn } from "@/lib/utils";

const TABS = ["activity", "learning", "sessions", "roles"];
const KINDS = [
    { key: "admin", label: "Admin changes" },
    { key: "session", label: "Sign-ins" },
    { key: "run", label: "Code runs" },
    { key: "submission", label: "Submissions" },
    { key: "points", label: "Points" },
    { key: "order", label: "Orders" },
];
const REASON_MIN = 10;

function Fact({ label, children }) {
    return (
        <div className="min-w-0 space-y-1 p-4">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="truncate text-sm">{children}</dd>
        </div>
    );
}

function Activity({ userId }) {
    const [kinds, setKinds] = useState([]);
    const query = useInfiniteQuery({
        queryKey: adminKeys.userActivity(userId, kinds),
        queryFn: ({ pageParam }) => adminClient.getUserActivity({ userId, kinds, before: pageParam }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextBefore,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });
    const items = (query.data?.pages || []).flatMap((page) => page.items);
    const toggle = (key) => setKinds((current) => (current.includes(key) ? current.filter((kind) => kind !== key) : [...current, key]));

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filter activity">
                {KINDS.map((kind) => (
                    <button
                        key={kind.key}
                        type="button"
                        aria-pressed={kinds.includes(kind.key)}
                        onClick={() => toggle(kind.key)}
                        className={cn(
                            "rounded-full border px-3 py-1 text-xs focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            kinds.includes(kind.key) ? "border-foreground bg-foreground text-background" : "border-input text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {kind.label}
                    </button>
                ))}
            </div>
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                {query.isPending ? (
                    <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-8 w-full" />)}</div>
                ) : query.isError ? (
                    <p className="p-4 text-sm">Couldn&apos;t load the activity. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                ) : items.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No activity of this kind.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {items.map((item, index) => (
                            <li key={`${item.kind}-${item.at}-${index}`} className="grid grid-cols-[7rem_minmax(0,1fr)_auto] items-baseline gap-3 px-4 py-2.5 text-sm">
                                <span className="text-xs text-muted-foreground">{KINDS.find((kind) => kind.key === item.kind)?.label || item.kind}</span>
                                <span className="min-w-0 truncate">
                                    <span className={item.kind === "admin" ? "font-mono text-xs" : ""}>{item.title}</span>
                                    {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
                                </span>
                                <time dateTime={item.at} title={formatDateTime(item.at)} className="text-xs text-muted-foreground">{formatRelative(item.at)}</time>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {query.hasNextPage && (
                <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                    {query.isFetchingNextPage ? "Loading…" : "Load older"}
                </Button>
            )}
        </div>
    );
}

function Learning({ user, can }) {
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                {user.enrollments.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">Not enrolled in any course.</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted-foreground">
                                <th scope="col" className="px-4 py-2 font-normal">Course</th>
                                <th scope="col" className="px-4 py-2 font-normal">Status</th>
                                <th scope="col" className="px-4 py-2 text-right font-normal">Progress</th>
                                <th scope="col" className="px-4 py-2 text-right font-normal">Last seen</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                            {user.enrollments.map((row) => (
                                <tr key={row.course_id}>
                                    <td className="max-w-0 truncate px-4 py-2.5">{row.title}</td>
                                    <td className="px-4 py-2.5 capitalize text-muted-foreground">{String(row.status || "").replace("_", " ")}</td>
                                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(row.progress)}%</td>
                                    <td className="px-4 py-2.5 text-right text-muted-foreground">{row.last_seen ? formatRelative(row.last_seen) : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            {(can("entitlement.grant") || can("points.adjust")) && (
                <p className="text-sm text-muted-foreground">
                    Course access, points and EXP are changed on <Link href="/admin/access" className="text-primary-ink hover:underline">Access</Link>.
                </p>
            )}
        </div>
    );
}

function Sessions({ user, can, onRevoke }) {
    return (
        <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border border-border bg-card">
                {user.sessions.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">No active session.</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {user.sessions.map((session) => (
                            <li key={session.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2.5 text-sm">
                                <span className="min-w-0">
                                    <span className="block truncate">{session.user_agent || "Unknown device"}</span>
                                    <span className="block text-xs text-muted-foreground">{session.ip_address || "—"} · signed in {formatDate(session.created_at)}</span>
                                </span>
                                <span className="text-xs text-muted-foreground">{session.last_seen_at ? formatRelative(session.last_seen_at) : "—"}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {can("session.revoke") && (
                user.permissions.canRevokeSessions ? (
                    <Button variant="outline" size="sm" onClick={onRevoke} disabled={user.sessions.length === 0}>Sign out everywhere</Button>
                ) : (
                    <p className="text-sm text-muted-foreground">{user.permissions.isSelf ? "Sign yourself out from Settings." : "Only a higher role can sign this account out."}</p>
                )
            )}
        </div>
    );
}

function Roles({ user, can, onChange }) {
    const held = new Set(user.roles.map((role) => role.code));
    return (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
                {user.assignableRoles.map((role) => {
                    const has = held.has(role.code);
                    return (
                        <li key={role.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
                            <span className="min-w-0">
                                <span className="block text-sm font-medium">{role.name}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {has ? "Assigned" : "Not assigned"}{!role.allowed && can("role.assign") ? ` · ${role.reason}` : ""}
                                </span>
                            </span>
                            {can("role.assign") && (
                                <Button variant="outline" size="sm" disabled={!role.allowed} onClick={() => onChange(role, !has)}>
                                    {has ? "Remove" : "Assign"}
                                </Button>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

export default function UserDetail({ userId }) {
    const { can } = useAdmin();
    const { showAlert } = useApp();
    const { data: user, isPending, isError, refetch } = useQuery(adminQueries.user(userId));
    const [tab, setTab] = useState("activity");
    const [dialog, setDialog] = useState(null);
    const [until, setUntil] = useState("");
    // datetime-local wants local time; the earliest end is an hour from when the screen opened.
    const [minUntil] = useState(() => {
        const soon = new Date(Date.now() + 60 * 60 * 1000);
        return new Date(soon.getTime() - soon.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    });
    const setStatus = useAdminSetUserStatus();
    const changeRole = useAdminChangeUserRole();
    const revokeSessions = useAdminRevokeUserSessions();

    const fail = (error) => showAlert(error?.status || 500, error?.message || "The change was not saved");
    const done = (message) => () => { showAlert(200, message); refetch(); };

    if (isPending) {
        return <div className="space-y-4" aria-busy="true"><Skeleton className="h-10 w-64" /><Skeleton className="h-24 w-full rounded-lg" /><Skeleton className="h-64 w-full rounded-lg" /></div>;
    }
    if (isError || !user) {
        return (
            <>
                <PageHeader title="User" />
                <p className="rounded-lg border border-border p-4 text-sm">
                    Couldn&apos;t load this user. <button type="button" onClick={() => refetch()} className="font-medium text-primary-ink hover:underline">Retry</button>
                </p>
            </>
        );
    }

    const locked = user.state === "suspended" || user.state === "blocked";
    const mayChangeStatus = can("user.status") && user.permissions.canChangeStatus;
    const staff = user.roles.filter((role) => role.code !== "user" && role.code !== "student");

    const statusAction = mayChangeStatus && (locked
        ? <Button onClick={() => setDialog({ kind: "activate" })}>Activate</Button>
        : <Button onClick={() => setDialog({ kind: "suspend" })}>Suspend</Button>);
    // A direct message is an announcement to this one user (docs/notification-plan.md 3.4).
    const messageAction = can("announcement.send") && !locked && (
        <Button variant="outline" asChild>
            <Link href={`/admin/announcements/new?user=${encodeURIComponent(user.username)}`}>Send notification</Link>
        </Button>
    );
    const actions = (statusAction || messageAction) && <>{messageAction}{statusAction}</>;

    return (
        <>
            <PageHeader
                title={user.username}
                description={<Finding tone={{ blocked: "critical", suspended: "attention" }[user.state]}>{`${user.state === "blocked" ? "Blocked · " : ""}Joined ${formatDate(user.created_at)} · ${user.last_active_at ? `last active ${formatRelative(user.last_active_at)}` : "never signed in"}${user.state === "suspended" ? ` · suspended until ${formatDateTime(user.status_until)}` : ""}`}</Finding>}
                actions={actions}
            >
                <StatusDot status={user.state} />
                {staff.map((role) => <span key={role.code} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{role.name}</span>)}
            </PageHeader>

            <dl className="mb-6 grid grid-cols-2 divide-border overflow-hidden rounded-lg border border-border bg-card @xl:grid-cols-4 [&>div]:border-border [&>div:nth-child(n+3)]:border-t @xl:[&>div:nth-child(n+3)]:border-t-0 @xl:[&>div:nth-child(n+5)]:border-t @xl:[&>div:not(:nth-child(4n+1))]:border-l [&>div:nth-child(even)]:border-l">
                <Fact label="Email">{user.email}</Fact>
                <Fact label="Sign-in methods">{user.providers.length ? user.providers.join(", ") : "—"}</Fact>
                <Fact label="Points"><span className="tabular-nums">{formatNumber(user.points)}</span></Fact>
                <Fact label="Level"><span className="tabular-nums">{user.level}</span> <span className="text-muted-foreground">· {formatNumber(user.exp)} EXP</span></Fact>
                <Fact label="Verified">{user.email_verified ? "Yes" : "No"}</Fact>
                <Fact label="Active sessions"><span className="tabular-nums">{formatNumber(user.sessions.length)}</span></Fact>
                <Fact label="Courses"><span className="tabular-nums">{formatNumber(user.enrollments.length)}</span></Fact>
                <Fact label="Status note">{user.status_reason || "—"}</Fact>
            </dl>

            <div role="tablist" aria-label="User sections" className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {TABS.map((key) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`user-tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`user-panel-${key}`}
                        onClick={() => setTab(key)}
                        className={cn(
                            "shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm capitalize focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            tab === key ? "border-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {key}
                    </button>
                ))}
            </div>

            <div role="tabpanel" id={`user-panel-${tab}`} aria-labelledby={`user-tab-${tab}`}>
                {tab === "activity" && <Activity userId={userId} />}
                {tab === "learning" && <Learning user={user} can={can} />}
                {tab === "sessions" && <Sessions user={user} can={can} onRevoke={() => setDialog({ kind: "revoke" })} />}
                {tab === "roles" && <Roles user={user} can={can} onChange={(role, add) => setDialog({ kind: "role", role, add })} />}
            </div>

            {mayChangeStatus && user.state !== "blocked" && (
                <section className="mt-10 rounded-lg border border-destructive/50" aria-label="Danger zone">
                    <div className="space-y-1 p-5">
                        <h2 className="text-sm font-semibold">Block account</h2>
                        <p className="text-sm text-muted-foreground">
                            Signs {user.username} out of every session. They cannot sign in until an admin activates the account.
                        </p>
                    </div>
                    <div className="flex justify-end border-t border-destructive/30 bg-destructive-soft/40 px-5 py-3">
                        <Button variant="destructive" size="sm" onClick={() => setDialog({ kind: "block" })}>Block account</Button>
                    </div>
                </section>
            )}

            <ConfirmDialog
                open={dialog?.kind === "suspend"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Suspend ${user.username}?`}
                description={`Signs them out of ${user.sessions.length} session${user.sessions.length === 1 ? "" : "s"}. The account opens again by itself at the end date.`}
                confirmLabel="Suspend account"
                reasonLabel="Reason"
                minReason={REASON_MIN}
                validate={() => (!until || new Date(until) <= new Date() ? "Pick an end date in the future." : null)}
                onConfirm={(reason) => setStatus.mutate(
                    { userId, status: "suspended", until: new Date(until).toISOString(), reason },
                    { onSuccess: done(`${user.username} is suspended`), onError: fail }
                )}
            >
                <Field>
                    <FieldLabel htmlFor="suspend-until">Suspended until</FieldLabel>
                    <DateField
                        id="suspend-until"
                        withTime
                        min={minUntil}
                        value={until}
                        onChange={setUntil}
                        placeholder="Pick an end date"
                        presets={[{ label: "1 day", days: 1 }, { label: "7 days", days: 7 }, { label: "30 days", days: 30 }]}
                    />
                </Field>
            </ConfirmDialog>

            <ConfirmDialog
                open={dialog?.kind === "block"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Block ${user.username}?`}
                description="Signs them out everywhere. They cannot sign in until an admin activates the account."
                confirmLabel="Block account"
                reasonLabel="Reason"
                minReason={REASON_MIN}
                confirmPhrase={user.username}
                onConfirm={(reason) => setStatus.mutate({ userId, status: "blocked", reason }, { onSuccess: done(`${user.username} is blocked`), onError: fail })}
            />

            <ConfirmDialog
                open={dialog?.kind === "activate"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Activate ${user.username}?`}
                description="They can sign in again at once."
                confirmLabel="Activate account"
                destructive={false}
                reasonLabel="Reason"
                minReason={REASON_MIN}
                onConfirm={(reason) => setStatus.mutate({ userId, status: "active", reason }, { onSuccess: done(`${user.username} is active`), onError: fail })}
            />

            <ConfirmDialog
                open={dialog?.kind === "revoke"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={`Sign ${user.username} out everywhere?`}
                description={`Ends ${user.sessions.length} session${user.sessions.length === 1 ? "" : "s"}. They can sign in again.`}
                confirmLabel="Sign out everywhere"
                reasonLabel="Reason"
                minReason={REASON_MIN}
                onConfirm={(reason) => revokeSessions.mutate({ userId, reason }, { onSuccess: done("Signed out of every session"), onError: fail })}
            />

            <ConfirmDialog
                open={dialog?.kind === "role"}
                onOpenChange={(open) => !open && setDialog(null)}
                title={dialog?.add ? `Give ${user.username} the ${dialog?.role?.name} role?` : `Remove the ${dialog?.role?.name} role from ${user.username}?`}
                description="Their sessions end so the new permissions apply at the next sign-in."
                confirmLabel={dialog?.add ? "Assign role" : "Remove role"}
                destructive={!dialog?.add}
                reasonLabel="Reason"
                minReason={REASON_MIN}
                confirmPhrase={dialog?.role && Number(dialog.role.rank) >= 80 ? user.username : undefined}
                onConfirm={(reason) => changeRole.mutate(
                    { userId, role: dialog.role.code, add: dialog.add, reason },
                    { onSuccess: done(dialog.add ? "Role assigned" : "Role removed"), onError: fail }
                )}
            />
        </>
    );
}
