'use client'
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"

import { Button } from "@/components/shadcn/button"
import { Spinner } from "@/components/shadcn/spinner"

import { LuMailCheck } from "react-icons/lu"

const PROVIDER_LABEL = { github: "GitHub", google: "Google" }

/**
 * /auth/link: a GitHub / Google sign-in found an existing account with the same email (pending
 * OAuth claim, docs/email-verification-plan.md 11.1 / 11.3 B). The confirmation link went out from
 * the OAuth callback; this page only says where, and offers Resend / Cancel.
 */
export default function LinkAccount() {
    const router = useRouter()
    const [resend, setResend] = useState(null)

    const { data, isPending: loading, isError } = useQuery({
        queryKey: ["auth", "pending-link"],
        queryFn: () => authClient.getPendingLink(),
        retry: false,
        staleTime: Infinity,
    })
    const link = data?.data
    const provider = PROVIDER_LABEL[link?.provider] || "your account"

    const handleResend = async () => {
        setResend("sending")
        try {
            await authClient.emailPendingLink()
            setResend("sent")
        } catch (err) {
            setResend(err?.status === 404 ? "This request expired. Sign in again to start over." : err?.message || "Could not send the email. Please try again.")
        }
    }

    const handleCancel = async () => {
        await authClient.cancelPendingLink().catch(() => { })
        router.push("/auth")
    }

    if (loading) {
        return (
            <div className="flex justify-center py-16" aria-busy="true">
                <Spinner />
            </div>
        )
    }

    if (isError || !link) {
        return (
            <section className="flex w-full max-w-md flex-col gap-4">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Link request expired</h1>
                <p className="text-sm text-muted-foreground">
                    This link request expired. Sign in with GitHub or Google again to start over.
                </p>
                <Button asChild className="self-start">
                    <Link href="/auth">Back to sign in</Link>
                </Button>
            </section>
        )
    }

    return (
        <section className="flex w-full max-w-md flex-col items-start gap-5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <LuMailCheck className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Check your inbox</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    A CodeDev account for {link.email} already exists (@{link.username}). We sent a link to that
                    address: open it to link {provider}
                    {link.mode === "claim" ? " and choose a new password" : ""}. The link expires in 30 minutes.
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <Button onClick={handleResend} disabled={resend === "sending" || resend === "sent"}>
                    {resend === "sending" && <Spinner />}
                    {resend === "sent" ? "Sent. Check your inbox" : "Resend link"}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancel}>
                    Cancel
                </Button>
            </div>
            {resend && !["sending", "sent"].includes(resend) && (
                <p className="text-sm text-destructive" role="alert">{resend}</p>
            )}
        </section>
    )
}
