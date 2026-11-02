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
 * With `reasonLabel` it asks for a reason (at least `minReason` characters, the server's rule for
 * audit entries) and keeps the dialog open with an inline error instead of ignoring a short answer.
 * `confirmPhrase` makes the admin type a word (the username) first, for actions that lock someone out.
 * `children` adds fields (a date); `validate()` returns an error message or null before confirming.
 */
export function ConfirmDialog({
    open, onOpenChange, title, description, confirmLabel, destructive = true, reasonLabel, onConfirm,
    minReason = MIN_REASON, confirmPhrase, children, validate,
}) {
    const id = useId();
    const [reason, setReason] = useState("");
    const [phrase, setPhrase] = useState("");
    const [error, setError] = useState("");

    const handleOpenChange = (next) => {
        if (!next) { setReason(""); setPhrase(""); setError(""); }
        onOpenChange(next);
    };

    const confirm = (event) => {
        const problem = (confirmPhrase && phrase.trim() !== confirmPhrase && `Type ${confirmPhrase} to confirm.`)
            || validate?.()
            || (reasonLabel && reason.trim().length < minReason && `Enter at least ${minReason} characters so the audit log explains this change.`);
        if (problem) {
            event.preventDefault();
            setError(problem);
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
                {children}
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
                            className="h-24 resize-none field-sizing-fixed"
                            autoFocus
                        />
                        {error ? <FieldError id={`${id}-reason-hint`}>{error}</FieldError> : (
                            <FieldDescription id={`${id}-reason-hint`}>Kept in the audit log. At least {minReason} characters.</FieldDescription>
                        )}
                    </Field>
                )}
                {confirmPhrase && (
                    <Field>
                        <FieldLabel htmlFor={`${id}-phrase`}>Type <span className="font-mono">{confirmPhrase}</span> to confirm</FieldLabel>
                        <input
                            id={`${id}-phrase`}
                            value={phrase}
                            onChange={(event) => { setPhrase(event.target.value); if (error) setError(""); }}
                            autoComplete="off"
                            spellCheck={false}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        />
                    </Field>
                )}
                {error && !reasonLabel && <FieldError>{error}</FieldError>}
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant={destructive ? "destructive" : "default"} onClick={confirm}>{confirmLabel}</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
