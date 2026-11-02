'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { adminClient } from "@/clients/premium.client";
import { leaveSignedOut } from "@/lib/authNavigation";
import { useLogOut } from "@/mutations/auth.mutation";
import { LogoMark } from "@/components/ui/logo";
import { Button } from "@/components/shadcn/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/shadcn/field";

const inputClass = "h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-base tracking-widest focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const group = (secret) => secret.match(/.{1,4}/g).join(" ");

function Shell({ title, children }) {
    return (
        <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
            <div className="w-full max-w-md space-y-6">
                <div className="flex items-center gap-2 text-sm font-semibold"><LogoMark size={22} />CodeDev Admin</div>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {children}
            </div>
        </main>
    );
}

function CodeForm({ label, hint, submitLabel, onSubmit, allowRecovery = false }) {
    const [code, setCode] = useState("");
    const [recovery, setRecovery] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const submit = async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
            await onSubmit(code.trim());
        } catch (failure) {
            setError(failure?.message || "That code is not valid.");
            setBusy(false);
        }
    };

    return (
        <form onSubmit={submit} className="space-y-4">
            <Field data-invalid={Boolean(error) || undefined}>
                <FieldLabel htmlFor="mfa-code">{recovery ? "Recovery code" : label}</FieldLabel>
                <input
                    id="mfa-code"
                    value={code}
                    onChange={(event) => { setCode(event.target.value); if (error) setError(""); }}
                    inputMode={recovery ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    maxLength={recovery ? 20 : 6}
                    aria-invalid={Boolean(error) || undefined}
                    aria-describedby="mfa-code-hint"
                    className={inputClass}
                    autoFocus
                />
                {error
                    ? <FieldError id="mfa-code-hint">{error}</FieldError>
                    : <FieldDescription id="mfa-code-hint">{recovery ? "One of the codes you saved when you set this up. Each works once." : hint}</FieldDescription>}
            </Field>
            <div className="flex items-center justify-between gap-3">
                {allowRecovery
                    ? <button type="button" className="text-sm text-primary-ink hover:underline" onClick={() => { setRecovery(!recovery); setCode(""); setError(""); }}>{recovery ? "Use the app code" : "Use a recovery code"}</button>
                    : <span />}
                <Button type="submit" disabled={busy || code.trim().length < 6}>{busy ? "Checking…" : submitLabel}</Button>
            </div>
        </form>
    );
}

function Enroll() {
    const router = useRouter();
    const [setup, setSetup] = useState(null);
    const [codes, setCodes] = useState(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [freshSignIn, setFreshSignIn] = useState(false);
    const queryClient = useQueryClient();
    const logout = useLogOut();

    // Enrolment needs a sign-in from the last 10 minutes: sign out, then come back to /admin after signing in.
    const signInAgain = () => {
        if (logout.isPending) return;
        const back = () => leaveSignedOut(queryClient, { target: "/auth?next=/admin" });
        logout.mutate(null, { onSuccess: back, onError: back });
    };

    const start = async () => {
        setBusy(true);
        setError("");
        try {
            setSetup(await adminClient.setupMfa());
        } catch (failure) {
            setError(failure?.message || "Could not start the setup.");
            setFreshSignIn(failure?.code === "FRESH_SIGN_IN_REQUIRED");
        }
        setBusy(false);
    };

    if (codes) {
        return (
            <Shell title="Save your recovery codes">
                <p className="text-sm text-muted-foreground">If you lose your phone, each of these opens the admin area once. They are shown only now: keep them in a password manager.</p>
                <ol className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-4 font-mono text-sm">
                    {codes.map((code) => <li key={code}>{code}</li>)}
                </ol>
                <div className="flex justify-between gap-3">
                    <Button variant="outline" onClick={() => navigator.clipboard?.writeText(codes.join("\n")).catch(() => {})}>Copy codes</Button>
                    <Button onClick={() => router.refresh()}>I saved them</Button>
                </div>
            </Shell>
        );
    }

    return (
        <Shell title="Set up two-factor authentication">
            <p className="text-sm text-muted-foreground">
                Admin accounts confirm each sign-in with a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, Bitwarden…).
            </p>
            {!setup ? (
                <>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    {freshSignIn
                        ? <Button onClick={signInAgain} disabled={logout.isPending}>{logout.isPending ? "Signing out…" : "Sign in again"}</Button>
                        : <Button onClick={start} disabled={busy}>{busy ? "Starting…" : "Start setup"}</Button>}
                </>
            ) : (
                <div className="space-y-5">
                    <ol className="list-decimal space-y-3 pl-5 text-sm">
                        <li>
                            In the app, add an account and scan this QR code:
                            <span className="mt-2 block w-fit rounded-lg border border-border bg-white p-2">
                                {/* eslint-disable-next-line @next/next/no-img-element -- a data URL drawn on the server */}
                                <img src={setup.qr} alt="QR code for the authenticator app" width={176} height={176} className="size-44" />
                            </span>
                        </li>
                        <li>
                            Cannot scan? Choose to enter a setup key and type this key (time based):
                            <span className="mt-1 block rounded-md bg-muted px-3 py-2 font-mono text-base tracking-wider break-all">{group(setup.secret)}</span>
                            <a href={setup.uri} className="mt-1 inline-block text-primary-ink hover:underline">Open in an authenticator app on this device</a>
                        </li>
                        <li>Type the 6-digit code the app shows.</li>
                    </ol>
                    <CodeForm
                        label="Code from the app"
                        hint="6 digits. It changes every 30 seconds."
                        submitLabel="Turn on"
                        onSubmit={async (code) => setCodes((await adminClient.confirmMfa(code)).recoveryCodes)}
                    />
                </div>
            )}
        </Shell>
    );
}

function Verify() {
    const router = useRouter();
    return (
        <Shell title="Confirm it's you">
            <p className="text-sm text-muted-foreground">Enter the code from your authenticator app to open the admin area.</p>
            <CodeForm
                label="Code from the app"
                hint="6 digits from your authenticator app."
                submitLabel="Continue"
                allowRecovery
                onSubmit={async (code) => { await adminClient.verifyMfa(code); router.refresh(); }}
            />
        </Shell>
    );
}

/** Shown by the admin layout instead of the admin screens until this session passed the second factor. */
export default function MfaGate({ mode }) {
    return mode === "enroll" ? <Enroll /> : <Verify />;
}
