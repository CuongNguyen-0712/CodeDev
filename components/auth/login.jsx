import { useState } from "react"

import { useQueryClient } from '@tanstack/react-query'
import { enterSignedIn, HOME_PATH } from '@/lib/authNavigation'
import { validate } from "@/lib/validate"
import { useApp } from "@/contexts/appContext"
import { SignInSchema } from "@/lib/definition"
import { authClient } from "@/clients/auth.client"
import { useLogin } from "@/mutations/auth.mutation"

import AuthAlert from "./authAlert"

import { InputGroup } from "../ui/input"

import { Button } from "@/components/shadcn/button"
import { FieldGroup } from "@/components/shadcn/field"
import { Spinner } from "@/components/shadcn/spinner"

import { LuLock, LuLogIn, LuUser } from "react-icons/lu"
import { SiGithub, SiGoogle } from "react-icons/si"

function formatLoginError(error) {
    const raw = String(error || "")
    if (raw.includes("CredentialsSignin") || raw.includes("check your credentials") || raw.includes("401")) {
        return "Incorrect username or password. Please verify your credentials and try again."
    }
    if (raw.includes("429") || raw.includes("Too many")) {
        return "Too many sign-in attempts. Please wait a moment before trying again."
    }
    if (raw.includes("500") || raw.includes("fetch failed") || raw.includes("Network")) {
        return "Unable to connect to the authentication server. Please check your network connection."
    }
    return error || "Sign in failed. Please check your credentials."
}

export default function Login({ active, changeForm, initialUsername = '' }) {
    const [formData, setFormData] = useState({
        username: initialUsername,
        password: '',
    })

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(null)
    const [serverError, setServerError] = useState(null)

    // After sign-in: full page load to /home (guest caches and prefetched redirects dropped).
    const queryClient = useQueryClient()
    const { showAlert: alert } = useApp()
    const loginMutation = useLogin()

    const handleSubmit = (e) => {
        e.preventDefault()

        if (loginMutation.isPending || isPending) return

        const { success, errors } = validate(SignInSchema, formData)

        if (!success) {
            setValidation(errors)
            return
        }

        setValidation({})
        setServerError(null)

        loginMutation.mutate(formData, {
            onSuccess: (response) => {
                if (!response?.ok) {
                    setServerError(formatLoginError(response?.error))
                    return
                }

                alert(200, "Login successful! Redirecting...")
                enterSignedIn(queryClient, HOME_PATH)
            },

            onError: (error) => {
                setServerError(formatLoginError(error?.message || error?.status))
            },

            onSettled: () => {
                setIsPending(null)
            }
        })
    }

    const handleValidation = (e) => {
        const { name, value } = e.target
        if (!value && !formData[name]) return

        const nextUpdate = {
            ...formData,
            [name]: value
        }

        const { errors } = validate(SignInSchema, nextUpdate)

        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return errors?.[name] ? { ...prev, [name]: errors[name] } : rest
        })
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setFormData((prev) => ({ ...prev, [name]: value }))

        // Clear field validation and server error once the user begins editing
        if (validation?.[name]) {
            setValidation((prev) => {
                const { [name]: removed, ...rest } = prev || {}
                return rest
            })
        }
        if (serverError) {
            setServerError(null)
        }
    }

    const handleClearInput = (name) => {
        setFormData((prev) => ({ ...prev, [name]: '' }))
        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return rest
        })
        if (serverError) {
            setServerError(null)
        }
    }

    const handleCallback = async (value) => {
        setIsPending(value)
        setServerError(null)

        try {
            const response = await authClient.loginWithProvider(value)

            // The browser is already on its way to the provider.
            if (response?.redirecting) return

            if (!response?.ok) {
                setServerError(response?.error || `Sign in with ${value} failed. Please try again.`)
                return
            }

            alert(200, "Login successful! Redirecting...")
            enterSignedIn(queryClient, HOME_PATH)
        } catch (error) {
            setServerError(error?.message || `Sign in with ${value} failed. Please try again.`)
        } finally {
            setIsPending(null)
        }
    }

    const isBusy = loginMutation.isPending || !!isPending

    // Both forms stay mounted inside the tabs so their state and pending
    // mutations survive a tab switch; only the active one renders fields,
    // which keeps the shared input ids (username, password) unique.
    if (!active) return null

    return (
        <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Sign in"
        >
            <FieldGroup className="gap-2.5">
                <InputGroup
                    name="username"
                    label="Username"
                    type="text"
                    value={formData.username}
                    onChange={handleChange}
                    error={validation?.username}
                    icon={<LuUser />}
                    reset={(name) => handleClearInput(name)}
                    disabled={isBusy}
                    onBlur={handleValidation}
                    autoComplete="username"
                />
                <InputGroup
                    name="password"
                    label="Password"
                    type="password"
                    value={formData.password}
                    onChange={handleChange}
                    error={validation?.password}
                    icon={<LuLock />}
                    reset={(name) => handleClearInput(name)}
                    disabled={isBusy}
                    isPassword={true}
                    onBlur={handleValidation}
                    autoComplete="current-password"
                />
            </FieldGroup>

            <div className="flex flex-col gap-3">
                <AuthAlert error={serverError} onDismiss={() => setServerError(null)} />

                <Button type="submit" size="lg" className="w-full" disabled={isBusy}>
                    {loginMutation.isPending ? <Spinner /> : <LuLogIn />}
                    {loginMutation.isPending ? "Signing in..." : "Sign in"}
                </Button>
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span>or continue with</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCallback('github')}
                    disabled={isBusy}
                    aria-label="Continue with GitHub"
                >
                    {isPending === 'github' ? <Spinner /> : <SiGithub aria-hidden="true" />}
                    GitHub
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCallback('google')}
                    disabled={isBusy}
                    aria-label="Continue with Google"
                >
                    {isPending === 'google' ? <Spinner /> : <SiGoogle aria-hidden="true" />}
                    Google
                </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">
                Don&apos;t have an account?{" "}
                <Button type="button" variant="link" className="h-auto p-0" onClick={changeForm}>
                    Create one
                </Button>
            </p>
        </form>
    )
}
