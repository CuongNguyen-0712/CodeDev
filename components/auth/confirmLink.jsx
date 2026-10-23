'use client'
import { useEffect, useRef, useState } from "react"
import Link from "next/link"

import { authClient } from "@/clients/auth.client"

import { Button } from "@/components/shadcn/button"
import { Spinner } from "@/components/shadcn/spinner"

import { LuCircleAlert, LuCircleCheck } from "react-icons/lu"

const PROVIDER_LABEL = { github: "GitHub", google: "Google" }

const COPY = {
    linked: (label) => ({
        title: `${label} is linked`,
        desc: `Your email is verified and the old password was removed. You were signed out everywhere: sign in with ${label} from now on.`,
        ok: true,
    }),
    expired: () => ({ title: "This link has expired", desc: "Links work for 30 minutes. Sign in with GitHub or Google again to get a new one.", ok: false }),
    in_use: () => ({ title: "This account is already linked", desc: "It belongs to another CodeDev account. Sign in with that account, or disconnect it there first.", ok: false }),
    invalid: () => ({ title: "This link is not valid", desc: "It may have been used already or replaced by a newer link.", ok: false }),
}

/** /auth/link/confirm?token=… (docs/email-verification-plan.md 10.3, case 5b). */
export default function ConfirmLink() {
    const [result, setResult] = useState(null)
    const [pending, setPending] = useState(false)
    const token = useRef(null)

    // Keep the token out of history, screenshots and any later Referer. Nothing is sent until the
    // click: confirming removes the password and signs out everywhere, so a link scanner or
    // preview that runs the page must not do it.
    useEffect(() => {
        token.current = new URLSearchParams(window.location.search).get("token")
        window.history.replaceState(null, "", window.location.pathname)
    }, [])

    const handleConfirm = async () => {
        setPending(true)
        try {
            const res = token.current ? await authClient.confirmLink(token.current) : null
            setResult(res?.data || { status: "invalid" })
        } catch (err) {
            setResult(err?.data?.data || { status: "invalid" })
        } finally {
            setPending(false)
        }
    }

    if (!result) {
        return (
            <section className="flex w-full max-w-md flex-col items-start gap-5">
                <div className="flex flex-col gap-2">
                    <h1 className="text-2xl font-semibold tracking-tight text-foreground">Confirm account link</h1>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                        Linking signs you out on every device and removes the account&apos;s current password.
                        From then on you sign in with the linked GitHub or Google account.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleConfirm} disabled={pending}>
                        {pending && <Spinner />}
                        {pending ? "Linking..." : "Confirm link"}
                    </Button>
                    <Button asChild variant="ghost">
                        <Link href="/auth">Cancel</Link>
                    </Button>
                </div>
            </section>
        )
    }

    const label = PROVIDER_LABEL[result.provider] || "GitHub or Google"
    const copy = (COPY[result.status] || COPY.invalid)(label)
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
            <Button asChild>
                <Link href="/auth">{copy.ok ? `Sign in with ${label}` : "Back to sign in"}</Link>
            </Button>
        </section>
    )
}
