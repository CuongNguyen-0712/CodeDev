import { useState } from "react"

import { useRouterActions } from "@/router/useRouterActions"
import { useSignUp } from "@/mutations/user.mutation"
import { SignUpSchema } from "@/lib/definition"
import { validate } from "@/lib/validate"
import { useApp } from "@/contexts/appContext"
import { authClient } from "@/clients/auth.client"
import { cn } from "@/lib/utils"

import { InputGroup } from "../ui/input"

import { Button } from "@/components/shadcn/button"
import { FieldGroup } from "@/components/shadcn/field"
import { Spinner } from "@/components/shadcn/spinner"

import {
    LuArrowLeft,
    LuArrowRight,
    LuAtSign,
    LuCheck,
    LuCircleAlert,
    LuKeyRound,
    LuLock,
    LuUser,
    LuUserPlus,
} from "react-icons/lu"
import { SiGithub, SiGoogle } from "react-icons/si"

const STEPS = ["Your details", "Account"]

export default function Signup({ active, changeForm }) {
    const [step, setStep] = useState(0)

    const { showAlert: alert } = useApp()
    const { navigateReplace } = useRouterActions()

    const signUpMutation = useSignUp()

    const defaultState = {
        surname: '',
        name: '',
        email: '',
        username: '',
        password: '',
        re_password: '',
    }
    const [formData, setFormData] = useState(defaultState)

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(null)
    // Presentation only: mirrors the toast so the reason stays visible next to the submit button.
    const [serverError, setServerError] = useState(null)

    const isBusy = signUpMutation.isPending || !!isPending

    const validateStep1 = () => {
        const step1Data = {
            ...formData,
            // dummy values for step 2 so zod doesn't fail whole object prematurely
            username: formData.username || 'dummy_user',
            password: formData.password || 'Dummy12345!',
            re_password: formData.password || 'Dummy12345!',
        }

        const { errors } = validate(SignUpSchema, step1Data)
        const step1Errors = {}

        if (errors?.surname) step1Errors.surname = errors.surname
        if (errors?.name) step1Errors.name = errors.name
        if (errors?.email) step1Errors.email = errors.email

        if (Object.keys(step1Errors).length > 0) {
            setValidation(prev => ({ ...prev, ...step1Errors }))
            return false
        }

        return true
    }

    const handleNextStep = () => {
        if (!validateStep1()) return
        setStep(1)
    }

    const handlePrevStep = () => {
        setStep(0)
    }

    const handleSubmit = (e) => {
        e.preventDefault()

        if (isBusy) return

        const { success, errors } = validate(SignUpSchema, formData)

        if (!success) {
            setValidation(errors)

            // If step 1 fields have errors, auto switch back to step 0
            if (errors?.surname || errors?.name || errors?.email) {
                setStep(0)
            }
            return
        }

        setValidation({})
        setServerError(null)

        signUpMutation.mutate(formData, {
            onSuccess: (response) => {
                alert(201, response?.message || "Account created successfully! Please sign in.")
                setFormData(defaultState)
                setStep(0)
                changeForm()
            },

            onError: (error) => {
                const status = error.status || error.response?.status || 500
                const message = error.message || error.response?.data?.message || error.response?.data?.error || "Sign up failed, please try again."
                alert(status, message)
                setServerError(message)
            }
        })
    }

    const handleValidation = (e) => {
        const { name, value } = e.target
        const nextUpdate = {
            ...formData,
            [name]: value
        }

        const { errors } = validate(SignUpSchema, nextUpdate)

        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return errors?.[name] ? { ...prev, [name]: errors[name] } : rest
        })
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
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
                alert(response?.status || 500, response?.error || "OAuth sign in failed, please try again.")
                return
            }

            alert(200, "Sign in successful! Redirecting...")
            navigateReplace('/home')
        } catch (error) {
            alert(error.status || 500, error.message || "OAuth sign in failed, please try again.")
        } finally {
            setIsPending(null)
        }
    }

    const isStep1Complete = formData.surname && formData.name && formData.email && !validation.surname && !validation.name && !validation.email

    // Both forms stay mounted inside the tabs so their state and pending
    // mutations survive a tab switch; only the active one renders fields,
    // which keeps the shared input ids (username, password) unique.
    if (!active) return null

    return (
        <form
            className="flex flex-col gap-6"
            onSubmit={handleSubmit}
            noValidate
            aria-label="Create an account"
        >
            <ol className="grid list-none grid-cols-2 gap-3" aria-label="Sign up progress">
                {STEPS.map((label, index) => {
                    const isCurrent = step === index
                    const isDone = step > index

                    return (
                        <li key={label}>
                            <button
                                type="button"
                                className="group flex min-h-8 w-full flex-col gap-2 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50"
                                aria-current={isCurrent ? "step" : undefined}
                                disabled={isBusy}
                                onClick={() => {
                                    if (index === 0) setStep(0)
                                    else if (validateStep1()) setStep(1)
                                }}
                            >
                                <span
                                    aria-hidden="true"
                                    className={cn(
                                        "h-1 w-full rounded-full transition-colors",
                                        isCurrent || isDone ? "bg-primary" : "bg-muted group-hover:bg-border"
                                    )}
                                />
                                <span className="flex items-center gap-1.5 text-xs">
                                    {isDone ? (
                                        <LuCheck className="size-3.5 text-primary" aria-hidden="true" />
                                    ) : (
                                        <span className={cn("tabular font-mono", isCurrent ? "text-foreground" : "text-muted-foreground")}>
                                            {index + 1}.
                                        </span>
                                    )}
                                    <span className={cn("font-medium", isCurrent ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>
                                        {label}
                                    </span>
                                    {isDone && <span className="sr-only">(completed)</span>}
                                </span>
                            </button>
                        </li>
                    )
                })}
            </ol>

            {step === 0 ? (
                <FieldGroup className="gap-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                        <InputGroup
                            name="surname"
                            label="Surname"
                            type="text"
                            value={formData.surname}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.surname}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            autoComplete="family-name"
                        />
                        <InputGroup
                            name="name"
                            label="Given name"
                            type="text"
                            value={formData.name}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.name}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            autoComplete="given-name"
                        />
                    </div>
                    <InputGroup
                        name="email"
                        label="Email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                        error={validation?.email}
                        icon={<LuAtSign />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        autoComplete="email"
                        inputMode="email"
                    />
                </FieldGroup>
            ) : (
                <FieldGroup className="gap-4">
                    <InputGroup
                        name="username"
                        label="Username"
                        type="text"
                        value={formData.username}
                        onChange={handleChange}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                        error={validation?.username}
                        icon={<LuUser />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        autoComplete="username"
                    />
                    <InputGroup
                        name="password"
                        label="Password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                        error={validation?.password}
                        icon={<LuKeyRound />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        isPassword={true}
                        autoComplete="new-password"
                        description="At least 8 characters."
                    />
                    <InputGroup
                        name="re_password"
                        label="Confirm password"
                        type="password"
                        value={formData.re_password}
                        onChange={handleChange}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                        error={validation?.re_password}
                        icon={<LuLock />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        isPassword={true}
                        autoComplete="new-password"
                    />
                </FieldGroup>
            )}

            <div className="flex flex-col gap-3">
                {step === 1 && serverError && !signUpMutation.isPending && (
                    <p
                        role="alert"
                        className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive-soft px-3 py-2 text-sm text-destructive"
                    >
                        <LuCircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                        <span>{serverError}</span>
                    </p>
                )}

                {step === 0 ? (
                    <Button
                        type="button"
                        size="lg"
                        className="w-full"
                        onClick={handleNextStep}
                        disabled={isBusy}
                    >
                        Continue
                        <LuArrowRight />
                    </Button>
                ) : (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2">
                        <Button
                            type="button"
                            size="lg"
                            variant="outline"
                            onClick={handlePrevStep}
                            disabled={isBusy}
                        >
                            <LuArrowLeft />
                            Back
                        </Button>
                        <Button type="submit" size="lg" disabled={isBusy}>
                            {signUpMutation.isPending ? <Spinner /> : <LuUserPlus />}
                            {signUpMutation.isPending ? "Creating account..." : "Create account"}
                        </Button>
                    </div>
                )}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
                <span>or sign up with</span>
                <span className="h-px flex-1 bg-border" aria-hidden="true" />
            </div>

            <div className="grid grid-cols-2 gap-2">
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCallback('github')}
                    disabled={isBusy}
                    aria-label="Sign up with GitHub"
                >
                    {isPending === 'github' ? <Spinner /> : <SiGithub aria-hidden="true" />}
                    GitHub
                </Button>
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleCallback('google')}
                    disabled={isBusy}
                    aria-label="Sign up with Google"
                >
                    {isPending === 'google' ? <Spinner /> : <SiGoogle aria-hidden="true" />}
                    Google
                </Button>
            </div>

            <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Button type="button" variant="link" className="h-auto p-0" onClick={changeForm}>
                    Sign in
                </Button>
            </p>
        </form>
    )
}
