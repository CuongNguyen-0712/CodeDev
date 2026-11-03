'use client';

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { adminKeys } from "@/keys/admin.keys";
import { SETTINGS_SECTIONS } from "@/lib/adminPermissions";
import { QUERY_TIMES, retryTransient } from "@/lib/queryTimes";
import PageHeader from "@/components/admin/shell/pageHeader";
import { formatNumber } from "@/components/admin/ui/format";
import { TableSkeleton } from "@/components/admin/ui/adminSkeleton";
import { Badge } from "@/components/shadcn/badge";
import { Input } from "@/components/shadcn/input";
import { cn } from "@/lib/utils";

import { LuCheck } from "react-icons/lu";

const ENV_HINT = "Changes are made through environment variables and a redeploy.";

/** A Vercel-style settings card: title, description, content, and a grey footer with a hint. */
function Card({ title, description, footer = ENV_HINT, children }) {
    return (
        <section className="overflow-hidden rounded-lg border border-border bg-card" aria-label={title}>
            <div className="space-y-4 p-5">
                <div className="space-y-1">
                    <h2 className="text-base font-semibold">{title}</h2>
                    {description && <p className="text-sm text-muted-foreground">{description}</p>}
                </div>
                {children}
            </div>
            {footer && <p className="border-t border-border bg-muted px-5 py-3 text-sm text-muted-foreground">{footer}</p>}
        </section>
    );
}

function Rows({ rows }) {
    return (
        <dl className="-mx-5 divide-y divide-border border-y border-border">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right tabular-nums">{value}</dd>
                </div>
            ))}
        </dl>
    );
}

function Matrix({ roles }) {
    const [query, setQuery] = useState("");
    const granted = new Set(roles.grants);
    const needle = query.trim().toLowerCase();
    const shown = needle
        ? roles.permissions.filter((permission) => [permission.code, permission.description, permission.resource].some((text) => text?.toLowerCase().includes(needle)))
        : roles.permissions;
    const byResource = shown.reduce((groups, permission) => {
        (groups[permission.resource] ||= []).push(permission);
        return groups;
    }, {});
    return (
        <>
        {/* Dozens of permissions: a filter finds one without scrolling the whole matrix. */}
        <div className="flex flex-wrap items-center gap-3">
            <Input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by permission, resource or description"
                aria-label="Filter permissions"
                className="max-w-sm"
            />
            <p className="text-sm text-muted-foreground" aria-live="polite">
                {needle ? `${shown.length} of ${roles.permissions.length} permissions` : `${roles.permissions.length} permissions`}
            </p>
        </div>
        {shown.length === 0 && <p className="text-sm text-muted-foreground">No permission matches “{query.trim()}”.</p>}
        {/* A phone has no room for one column per role: each permission lists the roles holding it. */}
        <div className="-mx-5 divide-y divide-border border-t border-border @2xl:hidden">
            {Object.entries(byResource).map(([resource, permissions]) => (
                <section key={resource} aria-label={resource}>
                    <h3 className="bg-muted/50 px-5 py-1.5 text-xs font-medium capitalize">{resource}</h3>
                    <ul className="divide-y divide-border">
                        {permissions.map((permission) => {
                            const holders = roles.roles.filter((role) => granted.has(`${role.code}:${permission.code}`));
                            return (
                                <li key={permission.code} className="space-y-1.5 px-5 py-2.5">
                                    <p className="font-mono text-xs">{permission.code}</p>
                                    {permission.description && <p className="text-xs text-muted-foreground">{permission.description}</p>}
                                    <p className="flex flex-wrap gap-1">
                                        {holders.length
                                            ? holders.map((role) => <Badge key={role.code} variant="primary">{role.name}</Badge>)
                                            : <span className="text-xs text-muted-foreground">No role holds it</span>}
                                    </p>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
        </div>
        <div tabIndex={0} aria-label="Permissions by role" role="region" className="-mx-5 overflow-x-auto border-t border-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset @max-2xl:hidden">
            <table className="w-full text-sm">
                <caption className="sr-only">Permissions held by each role</caption>
                <thead>
                    <tr className="text-xs text-muted-foreground">
                        <th scope="col" className="sticky left-0 bg-card px-5 py-2 text-left font-normal">Permission</th>
                        {roles.roles.map((role) => <th key={role.code} scope="col" className="px-3 py-2 text-center font-normal whitespace-nowrap">{role.name}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {Object.entries(byResource).map(([resource, permissions]) => [
                        <tr key={`h-${resource}`} className="border-t border-border"><th colSpan={roles.roles.length + 1} scope="colgroup" className="bg-muted/50 px-5 py-1.5 text-left text-xs font-medium capitalize">{resource}</th></tr>,
                        ...permissions.map((permission) => (
                            <tr key={permission.code} className="border-t border-border">
                                <th scope="row" className="sticky left-0 bg-card px-5 py-2 text-left font-normal">
                                    <span className="font-mono text-xs">{permission.code}</span>
                                    {permission.description && <span className="block text-xs text-muted-foreground">{permission.description}</span>}
                                </th>
                                {roles.roles.map((role) => {
                                    const has = granted.has(`${role.code}:${permission.code}`);
                                    return <td key={role.code} className="px-3 py-2 text-center">{has
                                        ? <LuCheck role="img" aria-label="Granted" className="mx-auto size-4 text-primary-ink" />
                                        : <span className="text-muted-foreground" aria-label="Not granted">—</span>}</td>;
                                })}
                            </tr>
                        )),
                    ])}
                </tbody>
            </table>
        </div>
        </>
    );
}

function Section({ section, data }) {
    if (section === "general") {
        const { general } = data;
        return (
            <Card title="Environment" description="What this deployment is wired to, checked at start-up (lib/envCheck.mjs).">
                <Rows rows={[["Environment", general.environment], ["APP_ENV", general.appEnv], ["Admin area", general.adminEnabled ? "On" : "Off (ADMIN_ENABLED=0)"]]} />
                {general.errors.length > 0 && <ul className="space-y-1 text-sm text-destructive">{general.errors.map((message) => <li key={message}>{message}</li>)}</ul>}
                {general.warnings.length > 0 && <ul className="space-y-1 text-sm text-muted-foreground">{general.warnings.map((message) => <li key={message}>{message}</li>)}</ul>}
                {general.errors.length === 0 && general.warnings.length === 0 && <p className="text-sm text-muted-foreground">No configuration error or warning.</p>}
            </Card>
        );
    }
    if (section === "roles") {
        return (
            <Card
                title="Roles & permissions"
                description="Read-only. A new permission is granted to super admin automatically; other changes go through a migration so they can be reviewed."
                footer="Assign or remove a user's roles on their page under Users."
            >
                <Matrix roles={data.roles} />
            </Card>
        );
    }
    if (section === "storage") return <Card title="Storage" description="Object storage for challenge files and code snapshots."><p className="text-sm">{data.storage.summary}</p></Card>;
    if (section === "mail") return <Card title="Mail" description="Where verification and account emails are sent from."><p className="text-sm">{data.mail.summary}</p></Card>;
    if (section === "limits") {
        const { limits } = data;
        return (
            <div className="space-y-4">
                <Card title="Code execution" description="Size and time limits shared by the app and the sandbox (lib/challenges/limits.js)." footer="Changed in code.">
                    <Rows rows={[
                        ["Source code", `${formatNumber(limits.maxSourceBytes / 1024)} KB`],
                        ["All inputs of one job", `${formatNumber(limits.maxTotalInputBytes / 1024)} KB`],
                        ["One job", `${formatNumber(limits.maxJobSeconds)} s`],
                        ["Quiz retry cooldown", `${formatNumber(limits.quizCooldownSeconds)} s`],
                    ]} />
                </Card>
                <Card title="Rate limits" description="Requests per user (or IP for guests) in each window (lib/rateLimit.js)." footer="Changed in code.">
                    <Rows rows={limits.rateLimits.map((limit) => [limit.name, `${formatNumber(limit.limit)} per ${formatNumber(limit.windowSeconds)} s`])} />
                </Card>
            </div>
        );
    }
    const { observability } = data;
    return (
        <Card title="Observability" description="Dashboards and alerts live in Grafana (docs/admin-panel-plan.md 6).">
            <Rows rows={[
                ["Grafana", observability.grafanaUrl ? <a href={observability.grafanaUrl} target="_blank" rel="noreferrer" className="text-primary-ink hover:underline">{observability.grafanaUrl}</a> : "Not set (GRAFANA_URL)"],
                ["Background jobs", observability.inngest ? "Inngest" : "Inline (Inngest not configured)"],
            ]} />
        </Card>
    );
}

export default function SettingsPage({ section }) {
    const query = useQuery({ queryKey: [...adminKeys.all, "settings"], queryFn: () => adminClient.getSettings(), ...QUERY_TIMES.live, retry: retryTransient });
    const current = SETTINGS_SECTIONS.find((item) => item.key === section) || SETTINGS_SECTIONS[0];

    return (
        <>
            <PageHeader title="Settings" description="Read-only configuration of this deployment." />
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[12rem_minmax(0,1fr)] md:gap-6">
                <nav aria-label="Settings sections">
                    <ul className="flex list-none gap-1 overflow-x-auto [scrollbar-width:none] md:flex-col [&::-webkit-scrollbar]:hidden">
                        {SETTINGS_SECTIONS.map((item) => (
                            <li key={item.key}>
                                <Link
                                    href={`/admin/settings/${item.key}`}
                                    aria-current={item.key === current.key ? "page" : undefined}
                                    className={cn(
                                        "block whitespace-nowrap rounded-md px-3 py-1.5 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                        item.key === current.key ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    {item.label}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </nav>
                <div className="min-w-0">
                    {query.isPending ? <TableSkeleton rows={4} columns={2} label="Loading settings" /> : query.isError ? (
                        <p className="rounded-lg border border-border p-4 text-sm">Couldn&apos;t load the settings. <button type="button" className="font-medium text-primary-ink hover:underline" onClick={() => query.refetch()}>Retry</button></p>
                    ) : <Section section={current.key} data={query.data} />}
                </div>
            </div>
        </>
    );
}
