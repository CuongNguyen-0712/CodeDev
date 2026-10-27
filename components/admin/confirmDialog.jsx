'use client';

import { useId, useState } from "react";

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";

const MIN_REASON = 5;

/**
 * Accessible replacement for window.confirm / window.prompt in the admin screens.
 * With `reasonLabel` it asks for a reason (at least 5 characters, the server's rule for audit entries)
 * and keeps the dialog open with an inline error instead of silently ignoring a short answer.
 */
export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, destructive = true, reasonLabel, onConfirm }) {
    const id = useId();
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    const handleOpenChange = (next) => {
        if (!next) { setReason(""); setError(""); }
        onOpenChange(next);
    };

    const confirm = (event) => {
        if (reasonLabel && reason.trim().length < MIN_REASON) {
            event.preventDefault();
            setError(`Enter at least ${MIN_REASON} characters so the audit log explains this change.`);
            return;
        }
        onConfirm(reasonLabel ? reason.trim() : undefined);
        handleOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                {reasonLabel && (
                    <Field data-invalid={Boolean(error) || undefined}>
                        <FieldLabel htmlFor={`${id}-reason`}>{reasonLabel}</FieldLabel>
                        <Textarea
                            id={`${id}-reason`}
                            value={reason}
                            onChange={(event) => { setReason(event.target.value); if (error) setError(""); }}
                            aria-invalid={Boolean(error) || undefined}
                            aria-describedby={`${id}-reason-hint`}
                            maxLength={500}
                            autoFocus
                        />
                        {error ? <FieldError id={`${id}-reason-hint`}>{error}</FieldError> : (
                            <FieldDescription id={`${id}-reason-hint`}>Kept in the audit log. At least {MIN_REASON} characters.</FieldDescription>
                        )}
                    </Field>
                )}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={confirm}>{confirmLabel}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
