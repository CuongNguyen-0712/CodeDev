import { useState } from "react"

import { useRouterActions } from '@/router/useRouterActions'
import { validate } from "@/lib/validate"
import { useApp } from "@/contexts/appContext"
import { SignInSchema } from "@/lib/definition"
import { authClient } from "@/clients/auth.client"
import { useLogin } from "@/mutations/auth.mutation"

import { InputGroup } from "../ui/input"

import { Button } from "@/components/shadcn/button"
import { FieldGroup } from "@/components/shadcn/field"
import { Spinner } from "@/components/shadcn/spinner"

import { LuCircleAlert, LuLock, LuLogIn, LuUser } from "react-icons/lu"
import { SiGithub, SiGoogle } from "react-icons/si"

export default function Login({ active, changeForm }) {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    })

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(null)
    // Presentation only: mirrors the toast so the reason stays visible next to the submit button.
    const [serverError, setServerError] = useState(null)

    const { navigateReplace } = useRouterActions()
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
                    alert(response?.status || 500, response?.error || "Login failed, please check your credentials.")
                    setServerError(response?.error || "Login failed, please check your credentials.")
                    return
                }

                alert(200, "Login successful! Redirecting...")
                navigateReplace('/home')
            },

            onError: (error) => {
                alert(error.status || 500, error.message || "Login failed, please try again.")
                setServerError(error.message || "Login failed, please try again.")
            },

            onSettled: () => {
                setIsPending(null)
            }
        })
    }

    const handleValidation = (e) => {
        const { name, value } = e.target
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
    }

    const handleClearInput = (name) => {
        setFormData((prev) => ({ ...prev, [name]: '' }))
        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return rest
        })
    }

    const handleClearValidation = (e) => {
        const { name } = e.target
        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return rest
        })
    }

    const handleCallback = async (value) => {
        setIsPending(value)

        try {
            const response = await authClient.loginWithProvider(value)

            // The browser is already on its way to the provider.
            if (response?.redirecting) return

            if (!response?.ok) {
                alert(response?.status || 500, response?.error || "OAuth login failed, please try again.")
                return
            }

            alert(200, "Login successful! Redirecting...")
            navigateReplace('/home')
        } catch (error) {
            alert(error.status || 500, error.message || "OAuth login failed, please try again.")
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
            <FieldGroup className="gap-4">
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
                    onFocus={handleClearValidation}
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
                    onFocus={handleClearValidation}
                    autoComplete="current-password"
                />
            </FieldGroup>

            <div className="flex flex-col gap-3">
                {serverError && !loginMutation.isPending && (
                    <p
                        role="alert"
                        className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2 text-sm text-destructive"
                    >
                        <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>{serverError}</span>
                    </p>
                )}

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
