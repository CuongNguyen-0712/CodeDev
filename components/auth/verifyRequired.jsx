'use client'
import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useSession } from "next-auth/react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"
import { updateUserProfileAction } from "@/actions/user.actions"
import { callWithAuthRetry, unwrapActionResult } from "@/lib/actionResult"
import { leaveSignedOut, LANDING_PATH } from "@/lib/authNavigation"
import { EMAIL_PATTERN } from "@/lib/definition"
import { maskEmail } from "@/lib/utils"
import { isVerifyLocked, safeNextPath } from "@/lib/verifyLock"
import { useLogOut } from "@/mutations/auth.mutation"
import { userKeys } from "@/keys/user.keys"
import { userQueries } from "@/queries/user.query"

import { Button } from "@/components/shadcn/button"
import { Input } from "@/components/shadcn/input"
import { Label } from "@/components/shadcn/label"
import { Spinner } from "@/components/shadcn/spinner"

import { LuMailWarning } from "react-icons/lu"

const COOLDOWN_SEC = 60
const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })

/**
 * /auth/verify-required (docs/email-verification-plan.md 12.3): where proxy.js and the API
 * clients send an account whose 7-day grace period ended. Leaves by itself once the email is
 * verified, in this tab or anywhere else (realtime refetches /api/user/me).
 */
export default function VerifyRequired() {
    const router = useRouter()
    const next = safeNextPath(useSearchParams().get("next"))
    const queryClient = useQueryClient()
    const { data: session, status, update } = useSession()
    const { data: me } = useQuery(userQueries.me(status))
    const logoutMutation = useLogOut()

    const [sending, setSending] = useState(false)
    const [cooldown, setCooldown] = useState(0)
    const [message, setMessage] = useState(null)
    const [editing, setEditing] = useState(false)
    const [email, setEmail] = useState("")
    const [saving, setSaving] = useState(false)
    const [emailError, setEmailError] = useState(null)
    const leaving = useRef(false)

    // Not locked (any more): verified here or elsewhere -> refresh the claim, then go back.
    const locked = isVerifyLocked(session)
    const verified = me?.email_verified === true
    useEffect(() => {
        if (status !== "authenticated" || leaving.current) return
        if (locked && !verified) return
        leaving.current = true
        const done = () => router.replace(next)
        if (locked) update().then(done, done)
        else done()
    }, [status, locked, verified, update, router, next])

    useEffect(() => {
        if (cooldown <= 0) return
        const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
        return () => clearTimeout(timer)
    }, [cooldown])

    if (status === "unauthenticated") {
        return (
            <section className="flex w-full max-w-md flex-col items-start gap-4">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Sign in to continue</h1>
                <Button asChild><Link href="/auth">Sign in</Link></Button>
            </section>
        )
    }

    if (status === "loading" || !me || !locked || verified) {
        return (
            <section className="flex flex-col items-center gap-3 py-16 text-muted-foreground" aria-busy="true">
                <Spinner />
            </section>
        )
    }

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

    const handleChangeEmail = async (event) => {
        event.preventDefault()
        const value = email.trim().toLowerCase()
        if (!EMAIL_PATTERN.test(value)) {
            setEmailError("Enter a valid email address.")
            return
        }
        setSaving(true)
        setEmailError(null)
        try {
            unwrapActionResult(await callWithAuthRetry(() => updateUserProfileAction({ email: value })))
            await queryClient.invalidateQueries({ queryKey: userKeys.me() })
            setEditing(false)
            setEmail("")
            setMessage(`Email updated. We sent a link to ${maskEmail(value)}.`)
            setCooldown(COOLDOWN_SEC)
        } catch (err) {
            setEmailError(err?.message || "Could not update your email. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    const handleSignOut = () => {
        if (logoutMutation.isPending) return
        logoutMutation.mutate(null, {
            onSettled: () => leaveSignedOut(queryClient, { target: LANDING_PATH }),
        })
    }

    return (
        <section className="flex w-full max-w-md flex-col items-start gap-5">
            <span className="flex size-11 items-center justify-center rounded-lg bg-warning-soft text-warning">
                <LuMailWarning className="size-5" aria-hidden="true" />
            </span>
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Verify your email to continue</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    {`Your 7-day grace period ended on ${formatDate(me.verify_lock_at || session.verifyLockAt)}. Confirm ${maskEmail(me.email)} to keep using CodeDev.`}
                    {me.purge_after && ` If you don't, this account and its learning data are deleted on ${formatDate(me.purge_after)}.`}
                </p>
                <p className="text-sm text-muted-foreground" role="status">{message}</p>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button onClick={handleResend} disabled={sending || cooldown > 0}>
                    {sending && <Spinner />}
                    {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend email"}
                </Button>
                <Button variant="outline" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
                    Change email
                </Button>
                <Button variant="ghost" onClick={handleSignOut} disabled={logoutMutation.isPending}>
                    {logoutMutation.isPending ? "Signing out..." : "Sign out"}
                </Button>
            </div>

            {editing && (
                <form onSubmit={handleChangeEmail} className="flex w-full flex-col gap-2" noValidate>
                    <Label htmlFor="verify-required-email">New email</Label>
                    <div className="flex w-full gap-2">
                        <Input
                            id="verify-required-email"
                            type="email"
                            autoComplete="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            aria-invalid={Boolean(emailError)}
                            aria-describedby={emailError ? "verify-required-email-error" : undefined}
                        />
                        <Button type="submit" disabled={saving}>
                            {saving && <Spinner />}
                            Save
                        </Button>
                    </div>
                    {emailError && <p id="verify-required-email-error" className="text-sm text-destructive" role="alert">{emailError}</p>}
                </form>
            )}
        </section>
    )
}
