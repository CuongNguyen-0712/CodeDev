'use client';

import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { friendQueries } from "@/queries/friend.query";
import { teamQueries } from "@/queries/team.query";
import { useTeamAction } from "@/mutations/team.mutation";
import { failAlert } from "@/components/chat/requestBanner";
import FriendButton from "./friendButton";
import { PeopleEmpty, PersonList, PersonRow } from "./personRow";

import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

import { LuCheck, LuInbox, LuSend, LuUsers, LuX } from "react-icons/lu";

const SECTIONS = {
    received: {
        title: "Received", icon: LuInbox,
        empty: ["No invitations", "When someone sends you a friend request, it shows up here."],
    },
    sent: {
        title: "Sent", icon: LuSend,
        empty: ["No pending requests", "Requests you send from Find people wait here until they are answered."],
    },
};

function Section({ direction }) {
    const { status } = useSession();
    const query = useInfiniteQuery(friendQueries.invitations(status, direction));
    const { title, icon: Icon, empty } = SECTIONS[direction];
    const headingId = `invitations-${direction}-heading`;

    return (
        <section aria-labelledby={headingId} className="flex flex-col gap-3">
            <h2 id={headingId} className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                {title}
            </h2>
            <PersonList
                query={query}
                noun="invitations"
                errorTitle="Could not load your invitations"
                empty={<PeopleEmpty icon={Icon} title={empty[0]} description={empty[1]} />}
                renderRow={(item, index) => (
                    <PersonRow key={item.id} item={item} index={index}
                        actions={<FriendButton user={item} friendship={direction} invitation />} />
                )}
            />
        </section>
    );
}

function TeamInvitationRow({ item }) {
    const { showAlert } = useApp();
    const { respond } = useTeamAction();
    const { team, invitedBy } = item;
    const answering = respond.isPending && respond.variables?.accept;

    // mutateAsync: the row leaves once the lists refetch, which can unmount it before the answer returns.
    const answer = (accept) => respond.mutateAsync({ teamId: team.id, accept }).then(
        () => showAlert(200, accept ? `You joined ${team.name}` : `Declined the invitation to ${team.name}`),
        failAlert(showAlert),
    );

    return (
        <li className="flex items-center gap-3 px-4 py-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <LuUsers className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{team.name}</p>
                <p className="truncate text-xs text-muted-foreground">Invited by {invitedBy.username}</p>
            </div>
            <div className="flex items-center gap-2">
                <Button size="sm" disabled={respond.isPending} onClick={() => answer(true)} aria-label={`Accept invitation to ${team.name}`}>
                    {answering ? <Spinner /> : <LuCheck aria-hidden="true" />}
                    <span className="max-sm:sr-only">Accept</span>
                </Button>
                <Button variant="outline" size="sm" disabled={respond.isPending} onClick={() => answer(false)} aria-label={`Decline invitation to ${team.name}`}>
                    {respond.isPending && !answering ? <Spinner /> : <LuX aria-hidden="true" />}
                    <span className="max-sm:sr-only">Decline</span>
                </Button>
            </div>
        </li>
    );
}

function TeamSection() {
    const { status } = useSession();
    const query = useInfiniteQuery(teamQueries.invitations(status));

    return (
        <section aria-labelledby="invitations-teams-heading" className="flex flex-col gap-3">
            <h2 id="invitations-teams-heading" className="flex min-h-8 items-center gap-2 text-sm font-medium text-foreground">
                <LuUsers className="size-4 text-muted-foreground" aria-hidden="true" />
                Teams
            </h2>
            <PersonList
                query={query}
                noun="team invitations"
                errorTitle="Could not load your team invitations"
                empty={<PeopleEmpty icon={LuUsers} title="No team invitations" description="When a friend invites you to a team, it shows up here." />}
                renderRow={(item) => <TeamInvitationRow key={item.team.id} item={item} />}
            />
        </section>
    );
}

/** Invitations tab: pending requests I received (Accept / Decline) and sent (Cancel), each its own infinite list. */
export default function InvitationsTab() {
    return (
        <div className="flex flex-col gap-6">
            <Section direction="received" />
            <Section direction="sent" />
            <TeamSection />
        </div>
    );
}
