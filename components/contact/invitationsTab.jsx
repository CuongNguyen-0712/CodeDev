'use client';

import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { friendQueries } from "@/queries/friend.query";
import { useFriendAction } from "@/mutations/friend.mutation";
import { useApp } from "@/contexts/appContext";
import { failAlert } from "@/components/chat/requestBanner";
import FriendButton from "./friendButton";
import { PeopleEmpty, PersonList, PersonRow, personName } from "./personRow";

import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

import { LuInbox, LuSend, LuX } from "react-icons/lu";

function CancelButton({ user }) {
    const { showAlert } = useApp();
    const { cancel } = useFriendAction();
    // mutateAsync: the optimistic change removes this row before the answer comes back.
    const run = () => cancel.mutateAsync(user.id).then(
        () => showAlert(200, `Request to ${user.username} cancelled`),
        failAlert(showAlert),
    );
    return (
        <Button variant="outline" size="sm" disabled={cancel.isPending} onClick={run} aria-label={`Cancel friend request to ${user.username}`}>
            {cancel.isPending ? <Spinner /> : <LuX aria-hidden="true" />}
            <span className="max-sm:sr-only">Cancel</span>
        </Button>
    );
}

const SECTIONS = {
    received: {
        title: "Received", icon: LuInbox,
        empty: ["No invitations", "When someone sends you a friend request, it shows up here."],
        actions: (item) => <FriendButton user={item} friendship="received" notify />,
    },
    sent: {
        title: "Sent", icon: LuSend,
        empty: ["No pending requests", "Requests you send from Find people wait here until they are answered."],
        actions: (item) => <CancelButton user={item} />,
    },
};

function Section({ direction }) {
    const { status } = useSession();
    const query = useInfiniteQuery(friendQueries.invitations(status, direction));
    const { title, icon: Icon, empty, actions } = SECTIONS[direction];
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
                    <PersonRow key={item.id} item={item} name={personName(item)} meta={`@${item.username}`} index={index} actions={actions(item)} />
                )}
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
        </div>
    );
}
