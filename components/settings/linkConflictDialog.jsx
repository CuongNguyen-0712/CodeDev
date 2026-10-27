'use client';

import { useId, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";

import { userClient } from "@/clients/user.client";
import { useLogOut } from "@/mutations/auth.mutation";

import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { Button } from "@/components/shadcn/button";
import { Field, FieldError, FieldLabel } from "@/components/shadcn/field";
import { Input } from "@/components/shadcn/input";
import { Spinner } from "@/components/shadcn/spinner";

const LABEL = { github: "GitHub", google: "Google" };
const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Connect from an unverified account hit a provider account of another user, @owner
 * (docs/email-verification-plan.md 12.4): keep learning there, optionally deleting this account
 * first, or stay. Nothing is merged. `conflict` comes from GET /api/user/delete-unverified.
 */
export default function LinkConflictDialog({ conflict, onClose }) {
    const id = useId();
    const { data: session } = useSession();
    const logout = useLogOut();
    const [step, setStep] = useState("choose");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(null);

    const label = LABEL[conflict.provider] || "This";
    const username = session?.user?.username || "";
    const owner = conflict.ownerUsername;
    // An ordinary sign-in with that provider account lands in its owner's account.
    const continueWithProvider = () => signIn(conflict.provider, { callbackUrl: "/home" });

    const handleSwitch = async () => {
        setBusy("switch");
        // useLogOut clears the local session even when the server call fails.
        await logout.mutateAsync().catch(() => { });
        await continueWithProvider();
    };

    const handleDelete = async () => {
        if (confirm.trim() !== username) {
            setError(`Type ${username} to confirm.`);
            return;
        }
        setBusy("delete");
        setError("");
        try {
            await userClient.deleteUnverified(confirm.trim());
        } catch (err) {
            setBusy(null);
            setError(err?.message || "Could not delete this account. Please try again.");
            return;
        }
        // The server already ended every session of the deleted account.
        await signOut({ redirect: false }).catch(() => { });
        await continueWithProvider();
    };

    return (
        <AlertDialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
            <AlertDialogContent>
                {step === "choose" ? (
                    <>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{`This ${label} account already belongs to @${owner}`}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {`You can keep learning as @${owner}. This account (@${username}) has not verified its email`}
                                {conflict.deletable && conflict.purgeAfter
                                    ? ` and will be deleted on ${formatDate(conflict.purgeAfter)} unless you verify it.`
                                    : "."}
                                {" Progress is not moved between accounts."}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="sm:flex-wrap">
                            <AlertDialogCancel disabled={Boolean(busy)}>Stay here</AlertDialogCancel>
                            {conflict.deletable && (
                                <Button variant="outline" disabled={Boolean(busy)} onClick={() => setStep("confirm")}>
                                    {`Delete @${username} and switch`}
                                </Button>
                            )}
                            <Button disabled={Boolean(busy)} onClick={handleSwitch}>
                                {busy === "switch" && <Spinner />}
                                {`Switch to @${owner}`}
                            </Button>
                        </AlertDialogFooter>
                    </>
                ) : (
                    <>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{`Delete @${username} permanently?`}</AlertDialogTitle>
                            <AlertDialogDescription>
                                {`Its learning progress, points, comments and messages are deleted now and cannot be recovered. Then you sign in as @${owner} with ${label}.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <Field data-invalid={Boolean(error) || undefined}>
                            <FieldLabel htmlFor={`${id}-confirm`}>{`Type ${username} to confirm`}</FieldLabel>
                            <Input
                                id={`${id}-confirm`}
                                value={confirm}
                                onChange={(event) => { setConfirm(event.target.value); if (error) setError(""); }}
                                aria-invalid={Boolean(error) || undefined}
                                aria-describedby={error ? `${id}-error` : undefined}
                                autoComplete="off"
                                autoFocus
                            />
                            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
                        </Field>
                        <AlertDialogFooter>
                            <Button variant="ghost" disabled={Boolean(busy)} onClick={() => { setStep("choose"); setError(""); }}>Back</Button>
                            <Button variant="destructive" disabled={Boolean(busy)} onClick={handleDelete}>
                                {busy === "delete" && <Spinner />}
                                Delete and switch
                            </Button>
                        </AlertDialogFooter>
                    </>
                )}
            </AlertDialogContent>
        </AlertDialog>
    );
}
