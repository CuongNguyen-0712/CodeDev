'use client'

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useApp } from "@/contexts/appContext";
import { createTeamSchema, teamNameSchema } from "@/lib/validation/team";
import { useTeamAction } from "@/mutations/team.mutation";

import FriendPicker from "@/components/chat/friendPicker";
import { failAlert } from "@/components/chat/requestBanner";
import TeamNameField from "@/components/chat/teamNameField";

import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Spinner } from "@/components/shadcn/spinner";

/** A team has 5 places: the host and up to 4 invited friends. */
export const TEAM_SIZE = 5;

/** The form-in-Dialog frame of the team dialogs: header, body, Cancel and submit; closing is blocked while `pending`. */
export function TeamFormContent({ title, description, submitLabel, canSubmit, pending, onSubmit, onCancel, className = "sm:max-w-md", children }) {
    const blockClose = (event) => { if (pending) event.preventDefault(); };
    return (
        <DialogContent showCloseButton={!pending} onEscapeKeyDown={blockClose} onInteractOutside={blockClose} className={className}>
            <form onSubmit={(event) => { event.preventDefault(); onSubmit(); }} noValidate className="grid gap-5">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{description}</DialogDescription>
                </DialogHeader>
                {children}
                <DialogFooter>
                    <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
                    <Button type="submit" disabled={!canSubmit || pending}>
                        {pending && <Spinner />}
                        {submitLabel}
                    </Button>
                </DialogFooter>
            </form>
        </DialogContent>
    );
}

function NewTeamForm({ onOpenChange }) {
    const router = useRouter();
    const { showAlert } = useApp();
    const { create } = useTeamAction();
    const [name, setName] = useState("");
    const [memberIds, setMemberIds] = useState([]);
    const [error, setError] = useState("");

    const submit = () => {
        const parsed = createTeamSchema.safeParse({ name, memberIds });
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        create.mutate(parsed.data, {
            onSuccess: ({ team }) => {
                onOpenChange(false);
                if (team?.conversationId) router.push(`/messages/${team.conversationId}`);
            },
            onError: failAlert(showAlert),
        });
    };

    return (
        <TeamFormContent
            title="New team"
            description={`Chat with up to ${TEAM_SIZE - 1} friends. They join when they accept your invitation.`}
            submitLabel="Create"
            canSubmit={teamNameSchema.safeParse(name).success && memberIds.length > 0}
            pending={create.isPending}
            onSubmit={submit}
            onCancel={() => onOpenChange(false)}
        >
            <TeamNameField value={name} onChange={(next) => { setName(next); setError(""); }} error={error} disabled={create.isPending} />
            <FriendPicker value={memberIds} onChange={setMemberIds} max={TEAM_SIZE - 1} disabled={create.isPending} />
        </TeamFormContent>
    );
}

/** /messages: name a team and pick 1-4 friends; on success the team conversation opens. */
export default function NewTeamDialog({ open, onOpenChange }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <NewTeamForm onOpenChange={onOpenChange} />}
        </Dialog>
    );
}
