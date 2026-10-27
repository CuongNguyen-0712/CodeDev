'use client'
import { useEffect, useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { useQuery } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"
import { userQueries } from "@/queries/user.query"
import { maskEmail } from "@/lib/utils"

import { Button } from "@/components/shadcn/button"
import { Spinner } from "@/components/shadcn/spinner"

import { LuMailWarning, LuX } from "react-icons/lu"

const DISMISS_KEY = "cd_verify_banner_dismissed"
const COOLDOWN_SEC = 60
const formatDeadline = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short" })

/**
 * "Verify your email" notice under the navbar for signed-in, unverified users
 * (docs/email-verification-plan.md 6.1). Dismissed for the browser session only; it hides by
 * itself once /api/user/me reports the email verified (the verify page and realtime refetch it).
 */
export default function VerifyEmailBanner() {
    const { status } = useSession()
    const { data: me } = useQuery(userQueries.me(status))
    // Read once on the client; the banner never renders before /api/user/me loads, so the
    // server render (null) always matches.
    const [dismissed, setDismissed] = useState(() => {
        try {
            return typeof window !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1"
        } catch {
            return false
        }
    })
    const [sending, setSending] = useState(false)
    const [message, setMessage] = useState(null)
    const [cooldown, setCooldown] = useState(0)

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    if (status !== "authenticated" || !me || me.email_verified !== false || dismissed) return null

    const handleResend = async () => {
        setSending(true)
        setMessage(null)
        try {
            await authClient.resendVerification()
            setMessage("Sent. Check your inbox and spam folder.")
            setCooldown(COOLDOWN_SEC)
        } catch (err) {
            setMessage(err?.message || "Could not send the email. Please try again.")
        } finally {
            setSending(false)
        }
    }

    // Grace period still running (plan 12): quote the lock date; after it, the deletion date.
    const lockAhead = me.verify_lock_at && new Date(me.verify_lock_at) > new Date()
    let notice = "Verify your email to secure your account and unlock purchases."
    if (lockAhead) notice = `Verify your email by ${formatDeadline(me.verify_lock_at)} to keep using CodeDev.`
    else if (me.purge_after) notice = `Verify your email by ${formatDeadline(me.purge_after)}, or this account and its data will be deleted.`

    const handleDismiss = () => {
        setDismissed(true)
        try { sessionStorage.setItem(DISMISS_KEY, "1") } catch { /* private mode: hide for this page only */ }
    }

    return (
        <div role="status" className="flex w-full items-start gap-3 border-b border-warning/25 bg-warning-soft px-4 py-2.5 text-sm text-foreground sm:items-center">
            <LuMailWarning className="mt-0.5 size-4 shrink-0 text-warning sm:mt-0" aria-hidden="true" />
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="min-w-0">
                    {notice}{" "}
                    <span className="text-muted-foreground">
                        {message || `We sent a link to ${maskEmail(me.email)}.`}
                    </span>
                </p>
                <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={handleResend} disabled={sending || cooldown > 0}>
                        {sending && <Spinner />}
                        {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                    </Button>
                    <Button size="sm" variant="ghost" asChild>
                        <Link href="/settings">Change email</Link>
                    </Button>
                </div>
            </div>
            <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={handleDismiss} aria-label="Hide for now">
                <LuX aria-hidden="true" />
            </Button>
        </div>
    )
}
