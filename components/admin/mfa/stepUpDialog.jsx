'use client';

import { useEffect, useRef, useState } from "react";

import { adminClient } from "@/clients/premium.client";
import { registerStepUp } from "@/lib/adminStepUp";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/shadcn/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";

/**
 * Asks for a code from the authenticator app when a sensitive admin action needs a recent
 * confirmation (403 REAUTH_REQUIRED); the request that triggered it is replayed on success.
 */
export default function StepUpDialog() {
    const [open, setOpen] = useState(false);
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const resolver = useRef(null);

    useEffect(() => registerStepUp(() => new Promise((resolve) => {
        resolver.current?.(false);
        resolver.current = resolve;
        setCode("");
        setError("");
        setOpen(true);
    })), []);

    const finish = (result) => {
        resolver.current?.(result);
        resolver.current = null;
        setOpen(false);
        setBusy(false);
    };

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await adminClient.verifyMfa(code.trim());
            finish(true);
        } catch (failure) {
            setError(failure?.message || "That code is not valid.");
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(value) => { if (!value) finish(false); }}>
            <DialogContent>
                <form onSubmit={submit} className="space-y-4">
                    <DialogHeader>
                        <DialogTitle>Confirm with your authenticator app</DialogTitle>
                        <DialogDescription>This action needs a confirmation from the last 15 minutes. The action continues after the code is accepted.</DialogDescription>
                    </DialogHeader>
                    <Field data-invalid={Boolean(error) || undefined}>
                        <FieldLabel htmlFor="step-up-code">Code</FieldLabel>
                        <input
                            id="step-up-code"
                            value={code}
                            onChange={(event) => { setCode(event.target.value); if (error) setError(""); }}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={20}
                            aria-describedby="step-up-hint"
                            className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-base tracking-widest focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            autoFocus
                        />
                        {error ? <FieldError id="step-up-hint">{error}</FieldError> : <FieldDescription id="step-up-hint">6 digits from the app, or a recovery code.</FieldDescription>}
                    </Field>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => finish(false)}>Cancel</Button>
                        <Button type="submit" disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : "Confirm"}</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
