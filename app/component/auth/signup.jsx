import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { useSignUp } from "@/app/mutation/auth.mutation"

import { SignUpSchema } from "@/app/lib/definition"

import { validate } from "@/app/helper/validate"

import { useApp } from "@/app/contexts/appContext"

import { authClient } from "@/app/clients/auth.client"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaArrowRight, FaArrowLeft, FaGithub, FaUser, FaLock, FaGoogle } from "react-icons/fa6"
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword } from "react-icons/md"

export default function Signup({ active, changeForm }) {
    const [step, setStep] = useState(0)

    const { showAlert: alert } = useApp()

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

    const handleSubmit = async (e) => {
        e.preventDefault()

        const { success, errors } = validate(SignUpSchema, formData)

        if (!success) {
            setValidation(errors)
            setIsPending(null)
            return
        }

        try {
            await signUpMutation.mutateAsync(formData)

            alert(201, "Account created successfully, please login")
            changeForm()
        } catch (err) {
            alert(err.status || 500, err.message || "Sign up failed, try again")
        } finally {
            setIsPending(null)
        }
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
            return errors?.[name] ? { ...prev, [name]: errors[name] } : { ...rest }
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
            await authClient.loginWithProvider(value)
        }
        catch (error) {
            setIsPending(null)
        }
    }

    const canGoNext = step < 1
    const canGoPrev = step > 0

    return (
        <Form className={`auth_form signup_form ${active ? 'active' : ''}`} onSubmit={handleSubmit}>
            <header className="form_header">
                <Image src="/image/static/logo.svg" width={48} height={48} alt="CodeDev Logo" />
                <h2>Create Account</h2>
                <p>Join <Link href="/">CodeDev</Link> community</p>
            </header>

            <div className="step_indicator">
                <div className={`step ${step > -1 ? 'active' : ''}`}>
                    <span className="step_number">1</span>
                    <span className="step_label">Personal Info</span>
                </div>
                <div className="step_line"></div>
                <div className={`step ${step > 0 ? 'active' : ''}`}>
                    <span className="step_number">2</span>
                    <span className="step_label">Account Setup</span>
                </div>
            </div>

            <div className="form_body">
                <div className="form_steps" style={{ transform: `translateX(${-(step * 50) + 25}%)` }}>
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
                            disabled={isPending}
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
                            disabled={isPending}
                            tabIndex={step === 0 ? 0 : -1}
                        />
                        <InputGroup
                            name="email"
                            label="Email Address"
                            type="text"
                            value={formData.email}
                            onChange={handleChange}
                            onBlur={handleValidation}
                            onFocus={handleClearValidation}
                            error={validation?.email}
                            icon={<MdAlternateEmail className="icon" />}
                            reset={(name) => handleClearInput(name)}
                            disabled={isPending}
                            tabIndex={step === 0 ? 0 : -1}
                        />
                    </div>

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
                            reset={handleClearInput}
                            disabled={isPending}
                            tabIndex={step === 1 ? 0 : -1}
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
                            icon={<MdOutlinePassword className="icon" />}
                            reset={handleClearInput}
                            disabled={isPending}
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
                            reset={handleClearInput}
                            disabled={isPending}
                            tabIndex={step === 1 ? 0 : -1}
                            isPassword={true}
                        />
                    </div>
                </div>
            </div>

            <div className="form_actions">
                <div className="step_navigation">
                    <button
                        type="button"
                        className={`nav_btn prev ${canGoPrev ? 'active' : ''}`}
                        onClick={() => setStep(0)}
                        disabled={!canGoPrev}
                    >
                        <FaArrowLeft />
                    </button>
                    <button
                        type="button"
                        className={`nav_btn next ${canGoNext ? 'active' : ''}`}
                        onClick={() => setStep(1)}
                        disabled={!canGoNext}
                    >
                        <FaArrowRight />
                    </button>
                </div>

                {step === 1 && (
                    <button type="submit" className="btn_submit" disabled={signUpMutation.isPending} tabIndex={step === 1 ? 0 : -1}>
                        {signUpMutation.isPending ?
                            <LoadingContent scale={0.5} color="var(--white)" />
                            : (
                                'Create Account'
                            )}
                    </button>
                )}
            </div>

            <footer className="form_footer">
                <div className="divider">
                    <span>or sign up with</span>
                </div>

                <div className="social_buttons">
                    <button
                        type="button"
                        className="social_btn"
                        onClick={() => handleCallback('github')}
                        disabled={isPending}
                    >
                        {
                            isPending === 'github' ? (
                                <LoadingContent scale={0.5} />
                            )
                                :
                                <>
                                    <FaGithub />
                                    <span>Github</span>
                                </>
                        }
                    </button>
                    <button
                        type="button"
                        className="social_btn"
                        onClick={() => handleCallback('google')}
                        disabled={isPending}
                    >
                        {
                            isPending === 'google' ? (
                                <LoadingContent scale={0.5} />
                            )
                                :
                                <>
                                    <FaGoogle />
                                    <span>Google</span>
                                </>
                        }
                    </button>
                </div>

                <p className="switch_form">
                    Already have an account?
                    <Link href="/auth" onClick={changeForm}>Sign in</Link>
                </p>
            </footer>
        </Form>
    )
}