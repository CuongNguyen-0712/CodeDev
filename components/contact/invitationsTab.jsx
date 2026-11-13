'use client';

import { useSession } from "next-auth/react";
import { useInfiniteQuery } from "@tanstack/react-query";

import { friendQueries } from "@/queries/friend.query";
import FriendButton from "./friendButton";
import { PeopleEmpty, PersonList, PersonRow } from "./personRow";

import { LuInbox, LuSend } from "react-icons/lu";

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

/** Invitations tab: pending requests I received (Accept / Decline) and sent (Cancel), each its own infinite list. */
export default function InvitationsTab() {
    return (
        <div className="flex flex-col gap-6">
            <Section direction="received" />
            <Section direction="sent" />
        </div>
    );
}
