'use client'

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useApp } from "@/contexts/appContext";
import { chatKeys } from "@/keys/chat.keys";
import { teamNameSchema } from "@/lib/validation/team";
import { useTeamAction } from "@/mutations/team.mutation";

import { TeamFormContent } from "@/components/chat/newTeamDialog";
import { failAlert } from "@/components/chat/requestBanner";
import TeamNameField from "@/components/chat/teamNameField";

import { Dialog } from "@/components/shadcn/dialog";

function RenameForm({ teamId, conversationId, currentName, onOpenChange }) {
    const queryClient = useQueryClient();
    const { showAlert } = useApp();
    const { rename } = useTeamAction();
    const [name, setName] = useState(currentName);
    const [error, setError] = useState("");
    const parsed = teamNameSchema.safeParse(name);

    const submit = () => {
        if (!parsed.success) return setError(parsed.error.issues[0]?.message);
        rename.mutate({ teamId, name: parsed.data }, {
            onSuccess: () => {
                // The header reads the conversation; the realtime update is best effort.
                queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
                showAlert(200, "Team renamed");
                onOpenChange(false);
            },
            onError: failAlert(showAlert),
        });
    };

    return (
        <TeamFormContent
            title="Rename team"
            description="Everyone in the team sees the new name."
            submitLabel="Save"
            canSubmit={parsed.success && parsed.data !== currentName}
            pending={rename.isPending}
            onSubmit={submit}
            onCancel={() => onOpenChange(false)}
            className="sm:max-w-sm"
        >
            <TeamNameField value={name} onChange={(next) => { setName(next); setError(""); }} error={error} disabled={rename.isPending} />
        </TeamFormContent>
    );
}

/** Host only: rename the team (1-20 characters, the create rule). */
export default function RenameTeamDialog({ open, onOpenChange, teamId, conversationId, currentName }) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {open && <RenameForm teamId={teamId} conversationId={conversationId} currentName={currentName} onOpenChange={onOpenChange} />}
        </Dialog>
    );
}
