'use client';

import { useState } from "react";

import { useApp } from "@/contexts/appContext";
import { useFriendAction } from "@/mutations/friend.mutation";
import { failAlert } from "@/components/chat/requestBanner";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

import { LuCheck, LuClock, LuUserPlus, LuX } from "react-icons/lu";

/**
 * The friend control for one person, by my `friendship` with them: Add friend, Requested (cancel after a
 * confirm), Accept + Decline, or nothing once we are friends. `invitation`: shown in the Invitations lists, where
 * the row leaves after an answer (so the answer is toasted) and a sent request reads Cancel instead of Requested.
 */
export default function FriendButton({ user, friendship, invitation = false }) {
    const { showAlert } = useApp();
    const { send, respond, cancel } = useFriendAction();
    const [confirming, setConfirming] = useState(false);
    // One write at a time per person: a second one would race the first on the server.
    const busy = send.isPending || respond.isPending || cancel.isPending;
    const name = user.username;

    // mutateAsync: an optimistic change can unmount this row before the answer comes back.
    const run = (mutation, input, done) => mutation.mutateAsync(input).then(
        () => { if (invitation && done) showAlert(200, done); },
        failAlert(showAlert),
    );

    if (friendship === 'friends') return null;

    if (friendship === 'received') {
        const answering = respond.isPending && respond.variables?.accept;
        return (
            <>
                <Button size="sm" disabled={busy} onClick={() => run(respond, { userId: user.id, accept: true }, `You and ${name} are now friends`)} aria-label={`Accept friend request from ${name}`}>
                    {answering ? <Spinner /> : <LuCheck aria-hidden="true" />}
                    <span className="max-sm:sr-only">Accept</span>
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => run(respond, { userId: user.id, accept: false }, `Declined ${name}'s request`)} aria-label={`Decline friend request from ${name}`}>
                    {respond.isPending && !answering ? <Spinner /> : <LuX aria-hidden="true" />}
                    <span className="max-sm:sr-only">Decline</span>
                </Button>
            </>
        );
    }

    if (friendship === 'sent') {
        const [label, Icon, aria] = invitation
            ? ['Cancel', LuX, `Cancel friend request to ${name}`]
            : ['Requested', LuClock, `Requested, cancel request to ${name}`];
        return (
            <>
                <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)} aria-label={aria}>
                    {busy ? <Spinner /> : <Icon aria-hidden="true" />}
                    <span className="max-sm:sr-only">{label}</span>
                </Button>
                <AlertDialog open={confirming} onOpenChange={(next) => !cancel.isPending && setConfirming(next)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Cancel your request to {name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                                {name} will no longer see your invitation. You can send a new one later.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel disabled={cancel.isPending}>Keep request</AlertDialogCancel>
                            <AlertDialogAction disabled={cancel.isPending} onClick={() => run(cancel, user.id, `Request to ${name} cancelled`)}>
                                {cancel.isPending && <Spinner />}
                                Cancel request
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </>
        );
    }

    return (
        <Button size="sm" disabled={busy} onClick={() => run(send, user.id)} aria-label={`Add friend ${name}`}>
            {busy ? <Spinner /> : <LuUserPlus aria-hidden="true" />}
            <span className="max-sm:sr-only">Add friend</span>
        </Button>
    );
}
