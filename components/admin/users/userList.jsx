'use client';

import Link from "next/link";
import { useEffect, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import PageHeader from "@/components/admin/shell/pageHeader";
import Finding, { plural } from "@/components/admin/ui/finding";
import StatusDot from "@/components/admin/ui/statusDot";
import TabBar from "@/components/admin/ui/tabBar";
import { useUrlFilters } from "@/components/admin/ui/useUrlFilters";
import { formatDate, formatNumber, formatRelative } from "@/components/admin/ui/format";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/shadcn/select";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuSearch } from "react-icons/lu";

const TABS = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "unverified", label: "Unverified" },
    { key: "suspended", label: "Suspended" },
    { key: "blocked", label: "Blocked" },
];
const ROLES = ["super_admin", "admin", "course_manager", "instructor", "user"];
const roleLabel = (code) => code.replace("_", " ");

function UserRow({ user }) {
    const staff = user.roles.filter((code) => code !== "user" && code !== "student");
    return (
        <li>
            <Link
                href={`/admin/users/${encodeURIComponent(user.id)}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
            >
                <span className="min-w-0">
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{user.username}</span>
                        {staff.map((code) => (
                            <Badge key={code} variant={code.endsWith("admin") ? "primary" : "muted"} className="capitalize">{roleLabel(code)}</Badge>
                        ))}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{user.email}</span>
                </span>
                <span className="hidden sm:block"><StatusDot status={user.state} /></span>
                <span className="text-right text-sm text-muted-foreground">
                    <span className="block sm:hidden"><StatusDot status={user.state} /></span>
                    <span className="block">{user.last_active_at ? formatRelative(user.last_active_at) : "Never signed in"}</span>
                    <span className="block text-xs">Joined {formatDate(user.created_at)}</span>
                </span>
            </Link>
        </li>
    );
}

/** The users screen's finding: locked accounts first, then accounts that never verified their email. */
function userFinding(counts) {
    const locked = (counts.suspended || 0) + (counts.blocked || 0);
    if (locked) return <Finding tone="attention">{`${plural(locked, "account")} suspended or blocked · ${plural(counts.all, "account")} in all.`}</Finding>;
    if (counts.unverified) return `${formatNumber(counts.unverified)} of ${plural(counts.all, "account")} have not verified their email yet.`;
    return <Finding tone="good">{`All ${plural(counts.all, "account")} are verified and none is locked.`}</Finding>;
}

export default function UserList() {
    const [{ tab, role, q }, update] = useUrlFilters({ tab: TABS.map((item) => item.key), role: ROLES, q: 100 }, { tab: "all" });
    const [search, setSearch] = useState(q);

    useEffect(() => {
        const timer = setTimeout(() => { if (search.trim() !== q) update({ q: search.trim() }); }, 300);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- debounce on typing only
    }, [search]);

    const filters = { tab, q, role };
    const query = useInfiniteQuery({
        queryKey: adminKeys.userList(filters),
        queryFn: ({ pageParam }) => adminClient.listUsers({ ...filters, cursor: pageParam }),
        initialPageParam: null,
        getNextPageParam: (page) => page.nextCursor,
        ...QUERY_TIMES.live,
        retry: retryTransient,
    });

    const pages = query.data?.pages || [];
    const users = pages.flatMap((page) => page.items);
    const counts = pages[0]?.counts;
    const total = counts?.[tab];

    return (
        <>
            <PageHeader
                title="Users"
                description={counts ? userFinding(counts) : undefined}
            />

            <TabBar tabs={TABS} value={tab} onChange={(key) => update({ tab: key })} counts={counts} label="Account state" />

            <div className="mb-4 flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-72">
                    <LuSearch aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Username, email or id"
                        aria-label="Search users"
                        className="pl-9"
                        maxLength={100}
                    />
                </div>
                <Select value={role || "any"} onValueChange={(value) => update({ role: value === "any" ? "" : value })}>
                    <SelectTrigger className="w-44" aria-label="Filter by role"><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="any">Any role</SelectItem>
                        {ROLES.map((code) => <SelectItem key={code} value={code} className="capitalize">{roleLabel(code)}</SelectItem>)}
                    </SelectContent>
                </Select>
                {total != null && <span className="ml-auto text-sm text-muted-foreground">{formatNumber(total)} {total === 1 ? "user" : "users"}</span>}
            </div>

            <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label="Users" aria-busy={query.isPending}>
                {query.isPending ? (
                    <ul className="divide-y divide-border">
                        {Array.from({ length: 6 }, (_, index) => <li key={index} className="px-4 py-3"><Skeleton className="h-10 w-full" /></li>)}
                    </ul>
                ) : query.isError ? (
                    <p className="p-4 text-sm">
                        Couldn&apos;t load users.{" "}
                        <button type="button" onClick={() => query.refetch()} className="font-medium text-primary-ink hover:underline">Retry</button>
                    </p>
                ) : users.length === 0 ? (
                    <p className="p-4 text-sm text-muted-foreground">{q ? `No account matches “${q}”.` : "No account in this state."}</p>
                ) : (
                    <ul className="divide-y divide-border">
                        {users.map((user) => <UserRow key={user.id} user={user} />)}
                    </ul>
                )}
            </section>

            {query.hasNextPage && (
                <div className="mt-4 flex items-center justify-center gap-3">
                    <span className="text-sm text-muted-foreground">{formatNumber(users.length)} of {formatNumber(total)}</span>
                    <Button variant="outline" size="sm" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                        {query.isFetchingNextPage ? "Loading…" : "Load more"}
                    </Button>
                </div>
            )}
        </>
    );
}
