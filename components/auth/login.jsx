import { useState } from "react"
import Image from "next/image"

import { useRouterActions } from '@/router/useRouterActions'
import { validate } from "@/lib/validate"
import { useApp } from "@/contexts/appContext"
import { SignInSchema } from "@/lib/definition"
import { authClient } from "@/clients/auth.client"
import { useLogin } from "@/mutations/auth.mutation"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaUser, FaLock, FaGithub, FaGoogle } from "react-icons/fa6"
import { HiArrowRightOnRectangle } from "react-icons/hi2"

import '@/styles/auth/login.css'

export default function Login({ active, changeForm }) {
    const [formData, setFormData] = useState({
        username: '',
        password: '',
    })

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(null)

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

        loginMutation.mutate(formData, {
            onSuccess: (response) => {
                if (!response?.ok) {
                    alert(response?.status || 500, response?.error || "Login failed, please check your credentials.")
                    return
                }

                alert(200, "Login successful! Redirecting...")
                navigateReplace('/home')
            },

            onError: (error) => {
                alert(error.status || 500, error.message || "Login failed, please try again.")
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

    const handleCallback = (value) => {
        setIsPending(value)
        authClient.loginWithProvider(value, {
            onSuccess: (response) => {
                if (!response?.ok) {
                    alert(response?.status || 500, response?.error || "OAuth login failed, please try again.")
                    return
                }

                alert(200, "Login successful! Redirecting...")
                navigateReplace('/home')
            },

            onError: (error) => {
                alert(error.status || 500, error.message || "OAuth login failed, please try again.")
            }
        }).finally(() => {
            setIsPending(null)
        })
    }

    const isBusy = loginMutation.isPending || !!isPending

    return (
        <form
            className={`auth_form login_form ${active ? 'active' : ''}`}
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
                <h2>Welcome Back</h2>
                <p>Sign in to access your courses, track code progress, and build projects.</p>
            </header>

            <div className="form_body">
                <div className="form_inputs">
                    <InputGroup
                        name="username"
                        label="Username"
                        type="text"
                        value={formData.username}
                        onChange={handleChange}
                        error={validation?.username}
                        icon={<FaUser className="icon" />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                    />
                    <InputGroup
                        name="password"
                        label="Password"
                        type="password"
                        value={formData.password}
                        onChange={handleChange}
                        error={validation?.password}
                        icon={<FaLock className="icon" />}
                        reset={(name) => handleClearInput(name)}
                        disabled={isBusy}
                        isPassword={true}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                    />
                </div>
            </div>

            <div className="form_actions">
                <div className="form_options">
                    <label className="remember_me">
                        <input type="checkbox" tabIndex={0} />
                        <span>Remember my session</span>
                    </label>
                </div>

                <button
                    type="submit"
                    className="btn_submit"
                    disabled={isBusy}
                >
                    {loginMutation.isPending ? (
                        <LoadingContent scale={0.5} color="var(--white)" />
                    ) : (
                        <>
                            <span>Sign In</span>
                            <HiArrowRightOnRectangle fontSize={18} />
                        </>
                    )}
                </button>
            </div>

            <footer className="form_footer">
                <div className="divider">
                    <span>or continue with</span>
                </div>

                <div className="social_buttons">
                    <button
                        type="button"
                        className="social_btn social_github"
                        onClick={() => handleCallback('github')}
                        disabled={isBusy}
                        aria-label="Continue with GitHub"
                    >
                        {isPending === 'github' ? (
                            <LoadingContent scale={0.4} />
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
                        aria-label="Continue with Google"
                    >
                        {isPending === 'google' ? (
                            <LoadingContent scale={0.4} />
                        ) : (
                            <>
                                <FaGoogle />
                                <span>Google</span>
                            </>
                        )}
                    </button>
                </div>

                <p className="switch_form">
                    Don't have an account?
                    <button
                        type="button"
                        className="switch_btn"
                        onClick={changeForm}
                    >
                        Create account
                    </button>
                </p>
            </footer>
        </form>
    )
}