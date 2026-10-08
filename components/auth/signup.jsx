import { useState } from "react"
import Link from "next/link"
import Image from "next/image"

import { useRouterActions } from "@/router/useRouterActions"
import { useSignUp } from "@/mutations/user.mutation"
import { SignUpSchema } from "@/lib/definition"
import { validate } from "@/lib/validate"
import { useApp } from "@/contexts/appContext"
import { authClient } from "@/clients/auth.client"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaArrowRight, FaArrowLeft, FaGithub, FaUser, FaLock, FaGoogle } from "react-icons/fa6"
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword, MdCheck } from "react-icons/md"
import { HiUserPlus } from "react-icons/hi2"

import '@/styles/auth/signup.css'

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

    return (
        <form
            className={`auth_form signup_form ${active ? 'active' : ''}`}
            onSubmit={handleSubmit}
            noValidate
        >
            <header className="form_header">
                <div className="form_logo_box">
                    <Image
                        src="/image/static/logo.svg"
                        width={44}
                        height={44}
                        alt="CodeDev Logo"
                        priority
                    />
                </div>
                <h2>Create an Account</h2>
                <p>Start learning, practice algorithms, and track your achievements.</p>
            </header>

            {/* Stepper Progress Bar */}
            <div className="step_indicator" role="navigation" aria-label="Sign up progress">
                <button
                    type="button"
                    className={`step ${step === 0 ? 'current' : 'completed'}`}
                    onClick={() => setStep(0)}
                >
                    <span className="step_number">
                        {step > 0 ? <MdCheck fontSize={14} /> : '1'}
                    </span>
                    <span className="step_label">Personal Info</span>
                </button>

                <div className={`step_line ${step > 0 ? 'active' : ''}`} />

                <button
                    type="button"
                    className={`step ${step === 1 ? 'current' : ''}`}
                    onClick={() => {
                        if (validateStep1()) setStep(1)
                    }}
                >
                    <span className="step_number">2</span>
                    <span className="step_label">Account Setup</span>
                </button>
            </div>

            {/* Form Step Body (Horizontal Slider) */}
            <div className="form_body">
                <div
                    className="form_steps"
                    style={{ transform: `translateX(-${step * 50}%)` }}
                >
                    {/* Step 1: Personal Information */}
                    <div className="form_step step_1">
                        <InputGroup
                            name="surname"
                            label="First Name"
                            type="text"
                            value={formData.surname}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.surname}
                            icon={<MdModeEdit className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 0 ? 0 : -1}
                        />
                        <InputGroup
                            name="name"
                            label="Last Name"
                            type="text"
                            value={formData.name}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.name}
                            icon={<MdModeEdit className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 0 ? 0 : -1}
                        />
                        <InputGroup
                            name="email"
                            label="Email Address"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.email}
                            icon={<MdAlternateEmail className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 0 ? 0 : -1}
                        />
                    </div>

                    {/* Step 2: Account Security & Credentials */}
                    <div className="form_step step_2">
                        <InputGroup
                            name="username"
                            label="Username"
                            type="text"
                            value={formData.username}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.username}
                            icon={<FaUser className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 1 ? 0 : -1}
                        />
                        <InputGroup
                            name="password"
                            label="Password (min 8 characters)"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.password}
                            icon={<MdOutlinePassword className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 1 ? 0 : -1}
                            isPassword={true}
                        />
                        <InputGroup
                            name="re_password"
                            label="Confirm Password"
                            type="password"
                            value={formData.re_password}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.re_password}
                            icon={<FaLock className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isBusy}
                            tabIndex={step === 1 ? 0 : -1}
                            isPassword={true}
                        />
                    </div>
                </div>
            </div>

            {/* Stepper Navigation & Submission */}
            <div className="form_actions">
                <div className="step_navigation">
                    {step === 0 ? (
                        <button
                            type="button"
                            className="btn_next_step"
                            onClick={handleNextStep}
                            disabled={isBusy}
                        >
                            <span>Next: Account Setup</span>
                            <FaArrowRight fontSize={13} />
                        </button>
                    ) : (
                        <div className="step_dual_actions">
                            <button
                                type="button"
                                className="btn_prev_step"
                                onClick={handlePrevStep}
                                disabled={isBusy}
                            >
                                <FaArrowLeft fontSize={13} />
                                <span>Back</span>
                            </button>

                            <button
                                type="submit"
                                className="btn_submit"
                                disabled={isBusy}
                                tabIndex={0}
                            >
                                {signUpMutation.isPending ? (
                                    <LoadingContent scale={0.5} color="var(--white)" />
                                ) : (
                                    <>
                                        <span>Create Account</span>
                                        <HiUserPlus fontSize={18} />
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Social Logins and Switch Tab Footer */}
            <footer className="form_footer">
                <div className="divider">
                    <span>or sign up with</span>
                </div>

                <div className="social_buttons">
                    <button
                        type="button"
                        className="social_btn social_github"
                        onClick={() => handleCallback('github')}
                        disabled={isBusy}
                        aria-label="Sign up with GitHub"
                    >
                        {isPending === 'github' ? (
                            <LoadingContent scale={0.5} color="var(--black)" />
                        ) : (
                            <>
                                <FaGithub />
                                <span>GitHub</span>
                            </>
                        )}
                    </button>
                    <button
                        type="button"
                        className="social_btn social_google"
                        onClick={() => handleCallback('google')}
                        disabled={isBusy}
                        aria-label="Sign up with Google"
                    >
                        {isPending === 'google' ? (
                            <LoadingContent scale={0.5} color="var(--amber-500)" />
                        ) : (
                            <>
                                <FaGoogle />
                                <span>Google</span>
                            </>
                        )}
                    </button>
                </div>

                <p className="switch_form">
                    Already have an account?
                    <button
                        type="button"
                        className="switch_btn"
                        onClick={changeForm}
                    >
                        Sign in
                    </button>
                </p>
            </footer>
        </form>
    )
}