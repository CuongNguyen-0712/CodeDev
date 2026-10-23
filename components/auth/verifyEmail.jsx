'use client'
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"
import { userKeys } from "@/keys/user.keys"

import { Button } from "@/components/shadcn/button"
import { Spinner } from "@/components/shadcn/spinner"

import { LuCircleAlert, LuCircleCheck, LuMailCheck } from "react-icons/lu"

const COPY = {
    verified: { title: "Email verified", desc: "Thanks, your email address is confirmed.", ok: true },
    already_verified: { title: "Your email is already verified", desc: "Nothing else to do here.", ok: true },
    expired: { title: "This link has expired", desc: "Verification links work for 24 hours. Get a new one below.", ok: false },
    invalid: { title: "This link is not valid", desc: "It may have been replaced by a newer link, or your email changed since it was sent.", ok: false },
}

/** /auth/verify-email?token=… (docs/email-verification-plan.md 4B and 6.5). */
export default function VerifyEmail() {
    const { status: sessionStatus } = useSession()
    const queryClient = useQueryClient()
    const [state, setState] = useState("verifying")
    const [resend, setResend] = useState(null)
    const started = useRef(false)

    useEffect(() => {
        if (started.current) return
        started.current = true

        const token = new URLSearchParams(window.location.search).get("token")
        // Keep the token out of history, screenshots and any later Referer.
        window.history.replaceState(null, "", window.location.pathname)

        const request = token ? authClient.verifyEmail(token) : Promise.resolve(null)
        request
            .then((res) => setState(res?.data?.status || "invalid"))
            .catch((err) => setState(err?.data?.data?.status || "invalid"))
            .finally(() => queryClient.invalidateQueries({ queryKey: userKeys.me() }))
    }, [queryClient])

    const handleResend = async () => {
        setResend("sending")
        try {
            await authClient.resendVerification()
            setResend("sent")
        } catch (err) {
            setResend(err?.message || "Could not send the email. Please try again.")
        }
    }

    if (state === "verifying") {
        return (
            <section className="flex flex-col items-center gap-3 py-16 text-muted-foreground" aria-busy="true">
                <Spinner />
                <p className="text-sm">Verifying your email...</p>
            </section>
        )
    }

    const copy = COPY[state] || COPY.invalid
    const signedIn = sessionStatus === "authenticated"
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

            {copy.ok ? (
                <Button asChild>
                    <Link href={signedIn ? "/home" : "/auth"}>{signedIn ? "Continue learning" : "Sign in"}</Link>
                </Button>
            ) : signedIn ? (
                <div className="flex flex-col gap-2">
                    <Button onClick={handleResend} disabled={resend === "sending" || resend === "sent"}>
                        {resend === "sending" ? <Spinner /> : <LuMailCheck />}
                        {resend === "sent" ? "Sent. Check your inbox" : "Send a new link"}
                    </Button>
                    {resend && !["sending", "sent"].includes(resend) && (
                        <p className="text-sm text-destructive" role="alert">{resend}</p>
                    )}
                </div>
            ) : (
                <Button asChild>
                    <Link href="/auth">Sign in to get a new link</Link>
                </Button>
            )}
        </section>
    )
}
