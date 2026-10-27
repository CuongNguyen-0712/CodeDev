'use client';

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { userQueries } from "@/queries/user.query";
import { useUpdatePrivacy } from "@/mutations/user.mutation";

import { ErrorReload } from "@/components/ui/error";
import { Label } from "@/components/shadcn/label";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Switch } from "@/components/shadcn/switch";

import { LuExternalLink } from "react-icons/lu";

const ROWS = [
    {
        key: "showProfile",
        label: "Show my profile to other learners",
        description: "Others can open your profile from comments, Contacts and the leaderboard. Off: your profile cannot be found.",
    },
    {
        key: "showLearning",
        label: "Show my courses and languages",
        description: "Lists the courses you are taking or have finished on your public profile. Counts are always shown.",
    },
    {
        key: "showOnLeaderboard",
        label: "Show me on the leaderboard",
        description: "Off: others no longer see you on the leaderboard. You still see your own rank.",
    },
];

// Each switch saves on its own; the switch shows the saved value, so a failed save flips it back.
export default function PrivacySection() {
    const { status } = useSession();
    const { showAlert: alert } = useApp();
    const { data, isLoading, isError, error, refetch } = useQuery(userQueries.privacy(status));
    const update = useUpdatePrivacy();

    if (isLoading) {
        return (
            <div className="space-y-4 p-4" role="status" aria-busy="true" aria-label="Loading privacy settings">
                {ROWS.map((row) => <Skeleton key={row.key} className="h-12 w-full" />)}
            </div>
        );
    }
    if (isError) return <div className="p-4"><ErrorReload data={error} refetch={refetch} compact /></div>;

    const pendingKey = update.isPending ? Object.keys(update.variables || {})[0] : null;

    const toggle = (key, value) => {
        update.mutate({ [key]: value }, {
            onError: (err) => alert(err?.status || 500, err?.message || "Could not save this setting"),
        });
    };

    return (
        <div className="flex flex-col">
            <ul className="m-0 list-none divide-y p-0">
                {ROWS.map((row) => {
                    const id = `privacy-${row.key}`;
                    const disabled = Boolean(pendingKey) || (row.key === "showLearning" && !data?.showProfile);
                    return (
                        <li key={row.key} className="flex items-start justify-between gap-4 px-4 py-3.5">
                            <div className="min-w-0 space-y-0.5">
                                <Label htmlFor={id} className="text-sm font-medium">{row.label}</Label>
                                <p id={`${id}-description`} className="text-xs text-muted-foreground">{row.description}</p>
                            </div>
                            <Switch
                                id={id}
                                checked={Boolean(data?.[row.key])}
                                onCheckedChange={(value) => toggle(row.key, value)}
                                disabled={disabled}
                                aria-describedby={`${id}-description`}
                                className="mt-0.5 shrink-0"
                            />
                        </li>
                    );
                })}
            </ul>
            {data?.showProfile && data?.username ? (
                <div className="border-t bg-muted/40 px-4 py-3">
                    <Link
                        href={`/profile/${encodeURIComponent(data.username)}`}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
                    >
                        View my public profile
                        <LuExternalLink className="size-3.5" aria-hidden="true" />
                    </Link>
                </div>
            ) : null}
        </div>
    );
}
