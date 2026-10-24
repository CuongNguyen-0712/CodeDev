'use client'
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"
import { enterSignedIn, HOME_PATH } from "@/lib/authNavigation"

import { InputGroup } from "../ui/input"

import { Button } from "@/components/shadcn/button"
import { FieldGroup } from "@/components/shadcn/field"
import { Spinner } from "@/components/shadcn/spinner"

import { LuCircleAlert, LuCircleCheck, LuLock } from "react-icons/lu"

const PROVIDER_LABEL = { github: "GitHub", google: "Google" }

const COPY = {
    linked_claim: () => ({
        title: "Account linked",
        desc: "Your email is verified and your new password is set. Every other device was signed out.",
        ok: true,
    }),
    linked_confirm: (label) => ({ title: `${label} is linked`, desc: `You can now sign in with ${label}.`, ok: true }),
    expired: () => ({ title: "This link has expired", desc: "Links work for 30 minutes. Sign in with GitHub or Google again to get a new one.", ok: false }),
    in_use: () => ({ title: "This account is already linked", desc: "It belongs to another CodeDev account. Sign in with that account, or disconnect it there first.", ok: false }),
    invalid: () => ({ title: "This link is not valid", desc: "It may have been used already, replaced by a newer link, or your email changed since it was sent.", ok: false }),
}

/**
 * /auth/link/confirm?token=…&mode=claim|confirm&provider=… — explicit confirmation of a pending
 * OAuth claim (docs/email-verification-plan.md 11.1 / 11.3 B). `mode` in the URL only shapes the
 * form; the server decides (and answers password_required when a password is missing).
 * A claim then signs in with the new password: the new session.
 */
export default function ConfirmLink() {
    const queryClient = useQueryClient()
    const [link, setLink] = useState({ token: null, mode: "claim", provider: null })
    const [values, setValues] = useState({ password: "", re_password: "" })
    const [error, setError] = useState(null)
    const [result, setResult] = useState(null)
    const [pending, setPending] = useState(false)
    const read = useRef(false)

    // Keep the token out of history, screenshots and any later Referer. Nothing is sent until the
    // click: a link scanner or preview that runs the page must not confirm anything.
    useEffect(() => {
        if (read.current) return
        read.current = true
        const params = new URLSearchParams(window.location.search)
        window.history.replaceState(null, "", window.location.pathname)
        // A promise keeps the state update out of the effect body (react-hooks/set-state-in-effect).
        Promise.resolve().then(() => setLink({
            token: params.get("token"),
            mode: params.get("mode") === "confirm" ? "confirm" : "claim",
            provider: params.get("provider"),
        }))
    }, [])

    const label = PROVIDER_LABEL[result?.provider || link.provider] || "GitHub or Google"
    const claim = link.mode === "claim"

    const handleChange = (e) => {
        setValues((v) => ({ ...v, [e.target.name]: e.target.value }))
        setError(null)
    }

    const handleConfirm = async (e) => {
        e.preventDefault()
        if (pending) return
        if (claim) {
            if (values.password.length < 8) return setError("The password must be at least 8 characters.")
            if (values.password !== values.re_password) return setError("The passwords do not match.")
        }

        setPending(true)
        setError(null)
        let data
        try {
            data = (await authClient.confirmLink(link.token, claim ? values.password : null))?.data
        } catch (err) {
            data = err?.data?.data
            if (data?.status === "password_required" || data?.status === "weak_password") {
                setLink((l) => ({ ...l, mode: "claim" }))
                setError(err?.message || "Choose a new password to finish.")
                setPending(false)
                return
            }
        }

        if (data?.status === "linked" && data.mode === "claim") {
            // The new session: sign in with the password just set.
            const res = await authClient.login({ username: data.username, password: values.password }).catch(() => null)
            if (res?.ok && !res?.error) return enterSignedIn(queryClient, HOME_PATH)
        }
        setResult(data || { status: "invalid" })
        setPending(false)
    }

    if (!result) {
        return (
            <section className="flex w-full max-w-md flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Link {label} to your account</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        {claim
                            ? "Choose a new password. Linking verifies your email, signs you out on every device and replaces every previous way to sign in to this account."
                            : `Confirm to sign in with ${label} from now on. Nothing else changes.`}
                    </p>
                </div>

                <form className="flex flex-col gap-6" onSubmit={handleConfirm} noValidate aria-label={`Link ${label}`}>
                    {claim && (
                        <FieldGroup className="gap-2.5">
                            <InputGroup
                                name="password"
                                label="New password"
                                type="password"
                                value={values.password}
                                onChange={handleChange}
                                reset={() => setValues((v) => ({ ...v, password: "" }))}
                                icon={<LuLock />}
                                disabled={pending}
                                isPassword={true}
                                autoComplete="new-password"
                            />
                            <InputGroup
                                name="re_password"
                                label="Confirm new password"
                                type="password"
                                value={values.re_password}
                                onChange={handleChange}
                                reset={() => setValues((v) => ({ ...v, re_password: "" }))}
                                icon={<LuLock />}
                                disabled={pending}
                                isPassword={true}
                                autoComplete="new-password"
                            />
                        </FieldGroup>
                    )}
                    {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                    <div className="flex gap-2">
                        <Button type="submit" disabled={pending || !link.token}>
                            {pending && <Spinner />}
                            {pending ? "Linking..." : claim ? "Link and sign in" : "Confirm link"}
                        </Button>
                        <Button asChild variant="ghost">
                            <Link href="/auth">Cancel</Link>
                        </Button>
                    </div>
                </form>
            </section>
        )
    }

    const key = result.status === "linked" ? `linked_${result.mode === "confirm" ? "confirm" : "claim"}` : result.status
    const copy = (COPY[key] || COPY.invalid)(label)
    const Icon = copy.ok ? LuCircleCheck : LuCircleAlert

    return (
        <section className="flex w-full max-w-md flex-col items-start gap-5">
            <span className={copy.ok
                ? "flex size-11 items-center justify-center rounded-lg bg-success-soft text-success"
                : "flex size-11 items-center justify-center rounded-lg bg-destructive-soft text-destructive"}>
                <Icon className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">{copy.title}</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">{copy.desc}</p>
            </div>
            {key === "linked_confirm" ? (
                <Button onClick={() => authClient.loginWithProvider(result.provider)}>Sign in with {label}</Button>
            ) : (
                <Button asChild>
                    <Link href="/auth">{copy.ok ? "Sign in" : "Back to sign in"}</Link>
                </Button>
            )}
        </section>
    )
}
