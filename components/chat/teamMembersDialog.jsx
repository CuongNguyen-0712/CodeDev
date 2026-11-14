'use client'

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { useTeamAction } from "@/mutations/team.mutation";
import { teamQueries } from "@/queries/team.query";

import { TEAM_SIZE } from "@/components/chat/newTeamDialog";
import { failAlert } from "@/components/chat/requestBanner";
import UserAvatar from "@/components/chat/userAvatar";
import { ErrorReload } from "@/components/ui/error";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Badge } from "@/components/shadcn/badge";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Skeleton } from "@/components/shadcn/skeleton";
import { Spinner } from "@/components/shadcn/spinner";

import { LuUserMinus } from "react-icons/lu";

const LIST = "m-0 list-none divide-y overflow-hidden rounded-lg border p-0";

function RemoveDialog({ open, target, onOpenChange, teamId }) {
    const { showAlert } = useApp();
    const { remove } = useTeamAction();
    const busy = remove.isPending;
    const name = target?.username;
    const confirm = () => remove.mutateAsync({ teamId, userId: target.id }).catch(failAlert(showAlert));

    return (
        <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        {target?.role === "invited"
                            ? `${name}'s invitation is withdrawn.`
                            : `${name} leaves the team and stops receiving its messages.`}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
                        {busy && <Spinner />}
                        Remove
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

function MemberRows({ teamId }) {
    const { data: session, status } = useSession();
    const query = useQuery(teamQueries.members(status, teamId));
    // The target outlives the open flag, so the closing dialog keeps its words.
    const [removing, setRemoving] = useState(null);
    const [confirming, setConfirming] = useState(false);

    if (query.isPending) {
        return (
            <ul className={LIST} aria-busy="true">
                {Array.from({ length: 3 }, (_, index) => (
                    <li key={index} className="flex items-center gap-3 px-4 py-3" aria-hidden="true">
                        <Skeleton className="size-9 rounded-full" />
                        <Skeleton className="h-4 w-32" />
                    </li>
                ))}
            </ul>
        );
    }
    if (query.isError) return <ErrorReload data={query.error} refetch={() => query.refetch()} compact title="Could not load the members" />;

    const items = query.data.items;
    const isHost = items.some((m) => m.role === "host" && m.id === session?.user?.id);
    return (
        <>
            <ul className={LIST}>
                {items.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 px-4 py-3">
                        <UserAvatar name={member.username} image={member.image} />
                        <div className="min-w-0 flex-1">
                            <p className="m-0 truncate text-sm font-medium text-foreground">{member.username}</p>
                            <p className="m-0 truncate text-xs text-muted-foreground">
                                {member.nickname && member.nickname !== "None" ? member.nickname : "No nickname"}
                            </p>
                        </div>
                        {member.role === "host" && <Badge variant="secondary">Host</Badge>}
                        {member.role === "invited" && <Badge variant="outline">Invited</Badge>}
                        {isHost && member.role !== "host" && (
                            <Button variant="ghost" size="sm" aria-label={`Remove ${member.username} from the team`} onClick={() => { setRemoving(member); setConfirming(true); }}>
                                <LuUserMinus aria-hidden="true" />
                                <span className="max-sm:sr-only">Remove</span>
                            </Button>
                        )}
                    </li>
                ))}
            </ul>
            <RemoveDialog open={confirming} target={removing} onOpenChange={setConfirming} teamId={teamId} />
        </>
    );
}

/** Members (n/5) in join order: the host and invited are labelled; the host can remove anyone else, after a confirmation. */
export default function TeamMembersDialog({ open, onOpenChange, teamId, count }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Members ({count}/{TEAM_SIZE})</DialogTitle>
                    <DialogDescription>In the order they joined.</DialogDescription>
                </DialogHeader>
                {open && <MemberRows teamId={teamId} />}
            </DialogContent>
        </Dialog>
    );
}
