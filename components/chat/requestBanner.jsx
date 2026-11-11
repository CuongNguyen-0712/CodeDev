'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useApp } from "@/contexts/appContext";
import { useBlockUser, useRespondRequest } from "@/mutations/chat.mutation";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";

export const failAlert = (showAlert) => (error) => showAlert(error?.status || 500, error?.message || "Something went wrong. Please try again.");

/**
 * Confirms blocking `name`, then blocks `userId` and leaves for /messages. Used by the banner and the header menu.
 * From the banner, `declineId` (the request's conversation) is declined after the block, so it leaves Requests.
 */
export function BlockDialog({ open, onOpenChange, name, userId, declineId }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const block = useBlockUser();
    const respond = useRespondRequest();
    const busy = block.isPending || respond.isPending;
    const confirm = async () => {
        try {
            await block.mutateAsync(userId);
            if (declineId) await respond.mutateAsync({ conversationId: declineId, accept: false });
            showAlert(200, `${name} is blocked`);
            router.replace("/messages");
        } catch (error) {
            failAlert(showAlert)(error);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Block {name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                        Neither of you can send messages to the other. You can still read this conversation, and unblock them in Settings.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" disabled={busy} onClick={confirm}>
                        {busy && <Spinner />}
                        Block
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

/** Shown to a member whose own state is pending: accept, decline or block the person writing. */
export default function RequestBanner({ conversationId, name, otherId }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const respond = useRespondRequest();
    const [blocking, setBlocking] = useState(false);

    // A declined conversation is hidden from this member, so leave it.
    const answer = (accept) => respond.mutate({ conversationId, accept }, {
        onSuccess: () => { if (!accept) router.replace("/messages"); },
        onError: failAlert(showAlert),
    });

    return (
        <div role="region" aria-label="Message request" className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary-soft-foreground sm:flex-row sm:items-center sm:justify-between">
            <p><span className="font-medium">{name}</span> wants to message you</p>
            <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => answer(true)} disabled={respond.isPending}>
                    {respond.isPending && respond.variables?.accept && <Spinner />}
                    Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => answer(false)} disabled={respond.isPending}>
                    {respond.isPending && respond.variables?.accept === false && <Spinner />}
                    Decline
                </Button>
                {otherId && (
                    <Button size="sm" variant="ghost" className="text-destructive" disabled={respond.isPending} onClick={() => setBlocking(true)}>
                        Block
                    </Button>
                )}
            </div>
            {otherId && <BlockDialog open={blocking} onOpenChange={setBlocking} name={name} userId={otherId} declineId={conversationId} />}
        </div>
    );
}
