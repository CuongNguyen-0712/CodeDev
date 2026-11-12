'use client'

import { useId, useState } from "react";

import { reportSchema } from "@/lib/validation/blog";

import {
    AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
    AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";
import { Textarea } from "@/components/shadcn/textarea";

/**
 * Asks why a message is reported (5-500 characters, the blog's report rule) and calls `onConfirm(reason)`.
 * The admin ConfirmDialog is the model; it lives under components/admin, so chat keeps its own.
 */
export default function ReportDialog({ open, onOpenChange, onConfirm }) {
    const id = useId();
    const [reason, setReason] = useState("");
    const [error, setError] = useState("");

    const handleOpenChange = (next) => {
        if (!next) { setReason(""); setError(""); }
        onOpenChange(next);
    };

    const confirm = (event) => {
        const parsed = reportSchema.safeParse({ reason });
        if (!parsed.success) {
            event.preventDefault();
            setError(parsed.error.issues[0]?.message || "Give a reason of at least 5 characters");
            return;
        }
        onConfirm(parsed.data.reason);
        handleOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={handleOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Report this message?</AlertDialogTitle>
                    <AlertDialogDescription>Moderators will review it. The sender is not told who reported it.</AlertDialogDescription>
                </AlertDialogHeader>
                <Field data-invalid={Boolean(error) || undefined}>
                    <FieldLabel htmlFor={`${id}-reason`}>Reason</FieldLabel>
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
                        <FieldDescription id={`${id}-reason-hint`}>At least 5 characters.</FieldDescription>
                    )}
                </Field>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={confirm}>Report</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
