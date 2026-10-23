'use client'
import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/clients/auth.client"
import { enterSignedIn, HOME_PATH } from "@/lib/authNavigation"

import AuthAlert from "./authAlert"

import { InputGroup } from "../ui/input"

import { Button } from "@/components/shadcn/button"
import { FieldGroup } from "@/components/shadcn/field"
import { Spinner } from "@/components/shadcn/spinner"

import { LuLink, LuLock, LuUser } from "react-icons/lu"

const PROVIDER_LABEL = { github: "GitHub", google: "Google" }

const LINK_ERROR = {
    LinkExpired: "This link request expired. Sign in with GitHub or Google again.",
    OAuthAccountInUse: "This account is already linked to another CodeDev account.",
}

function formatError(error) {
    const raw = String(error || "")
    if (LINK_ERROR[raw]) return LINK_ERROR[raw]
    if (raw.includes("CredentialsSignin") || raw.includes("Invalid username or password")) {
        return "Incorrect password. Please try again."
    }
    return raw || "Could not link the account. Please try again."
}

/**
 * /auth/link: a GitHub / Google account wants to join an existing account whose email was never
 * verified, so the owner proves it with the password, or by a link mailed to the account's email
 * (docs/email-verification-plan.md 10.3, cases 5a / 5b).
 */
export default function LinkAccount() {
    const router = useRouter()
    const queryClient = useQueryClient()
    const [password, setPassword] = useState("")
    const [error, setError] = useState(null)
    const [pending, setPending] = useState(false)
    const [mailed, setMailed] = useState(null)

    const { data, isPending: loading, isError } = useQuery({
        queryKey: ["auth", "pending-link"],
        queryFn: () => authClient.getPendingLink(),
        retry: false,
        staleTime: Infinity,
    })
    const link = data?.data
    const provider = PROVIDER_LABEL[link?.provider] || "your account"

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (pending) return
        if (!password) {
            setError("Enter your password.")
            return
        }

        setPending(true)
        setError(null)
        try {
            const res = await authClient.loginAndLink({ username: link.username, password })
            // A refused link still answers 200 (no session): next-auth reports it in `error`.
            if (!res?.ok || res?.error) {
                setError(formatError(res?.error))
                return
            }
            enterSignedIn(queryClient, HOME_PATH)
        } catch (err) {
            setError(formatError(err?.message))
        } finally {
            setPending(false)
        }
    }

    // Plan 10.3 case 5b: confirm by email; the confirmation also removes the unknown password.
    const handleEmail = async () => {
        setPending(true)
        setError(null)
        try {
            const res = await authClient.emailPendingLink()
            setMailed(res?.data || { email: link.email, minutes: 30 })
        } catch (err) {
            setError(formatError(err?.status === 404 ? "LinkExpired" : err?.message))
        } finally {
            setPending(false)
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
        <section className="flex w-full max-w-md flex-col gap-6">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-foreground">Link your {provider} account</h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                    An account for {link.email} already exists (@{link.username}). Sign in with its password
                    to link {provider}. You only need to do this once.
                </p>
            </div>

            <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate aria-label={`Link ${provider}`}>
                <FieldGroup className="gap-2.5">
                    <InputGroup
                        name="username"
                        label="Username"
                        type="text"
                        value={link.username}
                        onChange={() => { }}
                        icon={<LuUser />}
                        disabled
                        autoComplete="username"
                    />
                    <InputGroup
                        name="password"
                        label="Password"
                        type="password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null) }}
                        reset={() => setPassword("")}
                        icon={<LuLock />}
                        disabled={pending}
                        isPassword={true}
                        autoComplete="current-password"
                    />
                </FieldGroup>

                <div className="flex flex-col gap-3">
                    <AuthAlert error={error} onDismiss={() => setError(null)} />
                    <Button type="submit" size="lg" className="w-full" disabled={pending}>
                        {pending ? <Spinner /> : <LuLink />}
                        {pending ? "Signing in..." : "Sign in and link"}
                    </Button>
                </div>
            </form>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                {mailed ? (
                    <p role="status">Check {mailed.email}. The link expires in {mailed.minutes} minutes.</p>
                ) : (
                    <p>
                        Don&apos;t know this password?{" "}
                        <Button type="button" variant="link" className="h-auto p-0" onClick={handleEmail} disabled={pending}>
                            Email me a link instead
                        </Button>
                    </p>
                )}
                <Button type="button" variant="ghost" onClick={handleCancel} disabled={pending}>
                    Cancel
                </Button>
            </div>
        </section>
    )
}
