'use client';

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { useApp } from "@/contexts/appContext";
import { userQueries } from "@/queries/user.query";
import { useRevokeOtherSessions, useRevokeSession } from "@/mutations/user.mutation";

import { ErrorReload } from "@/components/ui/error";

import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuLoaderCircle, LuLogOut, LuMonitor, LuSmartphone } from "react-icons/lu";

const MOBILE_OS = new Set(["Android", "iOS"]);

const relativeTime = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatLastActive(value) {
    const time = new Date(value).getTime();
    if (Number.isNaN(time)) return "Unknown";

    const minutes = Math.round((time - Date.now()) / 60000);
    if (Math.abs(minutes) < 1) return "Just now";
    if (Math.abs(minutes) < 60) return relativeTime.format(minutes, "minute");

    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return relativeTime.format(hours, "hour");

    return relativeTime.format(Math.round(hours / 24), "day");
}

function SessionRow({ item, onRevoke, revoking }) {
    const Icon = MOBILE_OS.has(item.os) ? LuSmartphone : LuMonitor;

    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                    {item.browser} on {item.os}
                    {item.current && <Badge variant="success">This device</Badge>}
                </p>
                <p className="text-xs text-muted-foreground">
                    Last active {formatLastActive(item.lastActiveAt)}
                    <span aria-hidden="true"> · </span>
                    Signed in {new Date(item.createdAt).toLocaleDateString()}
                </p>
            </div>
            {!item.current && (
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRevoke(item.id)}
                    disabled={revoking}
                    aria-label={`Sign out ${item.browser} on ${item.os}`}
                >
                    {revoking ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuLogOut aria-hidden="true" />}
                    Sign out
                </Button>
            )}
        </li>
    );
}

export default function SessionsSection() {
    const { status } = useSession();
    const { showAlert: alert } = useApp();

    const { data, isLoading, isError, error, refetch } = useQuery(userQueries.sessions(status));
    const revokeOne = useRevokeSession();
    const revokeOthers = useRevokeOtherSessions();

    const sessions = Array.isArray(data) ? data : [];
    const others = sessions.filter((item) => !item.current);

    const handleRevoke = (sessionId) => {
        revokeOne.mutate(sessionId, {
            onSuccess: () => alert(200, "That device has been signed out."),
            onError: (err) => alert(err?.status || 500, err?.message || "Could not sign that device out."),
        });
    };

    const handleRevokeOthers = () => {
        revokeOthers.mutate(undefined, {
            onSuccess: (res) => alert(200, `Signed out ${res?.revoked ?? 0} other device(s).`),
            onError: (err) => alert(err?.status || 500, err?.message || "Could not sign out other devices."),
        });
    };

    if (isLoading) {
        return (
            <div className="flex flex-col gap-3 p-4" role="status" aria-busy="true" aria-label="Loading sessions">
                {[0, 1].map((index) => (
                    <div key={index} className="flex items-center gap-3">
                        <Skeleton className="size-9 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-56 max-w-full" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (isError) {
        return (
            <div className="p-4">
                <ErrorReload data={error} refetch={refetch} title="Could not load your sessions" />
            </div>
        );
    }

    return (
        <div>
            <ul className="list-none divide-y">
                {sessions.map((item) => (
                    <SessionRow
                        key={item.id}
                        item={item}
                        onRevoke={handleRevoke}
                        revoking={revokeOne.isPending && String(revokeOne.variables) === String(item.id)}
                    />
                ))}
            </ul>
            <div className="flex flex-col-reverse gap-3 border-t bg-muted/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-muted-foreground">
                    {others.length > 0
                        ? "Signed-out devices lose access within a minute."
                        : "You are only signed in on this device."}
                </p>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRevokeOthers}
                    disabled={others.length === 0 || revokeOthers.isPending}
                >
                    {revokeOthers.isPending ? <LuLoaderCircle className="animate-spin" aria-hidden="true" /> : <LuLogOut aria-hidden="true" />}
                    {revokeOthers.isPending ? "Signing out..." : "Sign out other devices"}
                </Button>
            </div>
        </div>
    );
}
