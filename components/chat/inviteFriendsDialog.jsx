'use client'

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { useTeamAction } from "@/mutations/team.mutation";
import { teamQueries } from "@/queries/team.query";

import FriendPicker from "@/components/chat/friendPicker";
import { TEAM_SIZE, TeamFormContent } from "@/components/chat/newTeamDialog";
import { failAlert } from "@/components/chat/requestBanner";
import { PeopleEmpty } from "@/components/contact/personRow";
import { ErrorReload } from "@/components/ui/error";

import { Dialog } from "@/components/shadcn/dialog";
import { Skeleton } from "@/components/shadcn/skeleton";

import { LuUsers } from "react-icons/lu";

function InviteForm({ teamId, onOpenChange }) {
    const { status } = useSession();
    const { showAlert } = useApp();
    const { invite } = useTeamAction();
    const members = useQuery(teamQueries.members(status, teamId));
    const [userIds, setUserIds] = useState([]);

    // The host sees the invited too, and they hold a place (spec rule 2).
    const taken = members.data?.items ?? [];
    const free = Math.max(0, TEAM_SIZE - taken.length);

    const submit = () => invite.mutate({ teamId, userIds }, {
        onSuccess: () => onOpenChange(false),
        onError: failAlert(showAlert),
    });

    let body;
    if (members.isPending) body = <Skeleton className="h-24 w-full" aria-busy="true" />;
    else if (members.isError) body = <ErrorReload data={members.error} refetch={() => members.refetch()} compact title="Could not load the team" />;
    else if (free === 0) body = <PeopleEmpty icon={LuUsers} title="The team is full" description={`A team has ${TEAM_SIZE} places, invitations included.`} />;
    else {
        body = (
            <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground tabular-nums">{free} free {free === 1 ? 'slot' : 'slots'}</p>
                <FriendPicker value={userIds} onChange={setUserIds} max={free} exclude={taken.map((m) => m.id)} disabled={invite.isPending} />
            </div>
        );
    }

    return (
        <TeamFormContent
            title="Invite friends"
            description="They join the team when they accept."
            submitLabel="Invite"
            canSubmit={free > 0 && userIds.length > 0}
            pending={invite.isPending}
            onSubmit={submit}
            onCancel={() => onOpenChange(false)}
        >
            {body}
        </TeamFormContent>
    );
}

/** Host only: invite friends who are not in the team or invited yet, up to the free places. */
export default function InviteFriendsDialog({ open, onOpenChange, teamId }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <InviteForm teamId={teamId} onOpenChange={onOpenChange} />}
        </Dialog>
    );
}
