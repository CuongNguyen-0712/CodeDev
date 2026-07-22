import { useState } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { useApp } from "@/app/contexts/appContext"

import { validate } from "@/app/helper/validate"

import { SignInSchema } from "@/app/lib/definition"

import { authClient } from "@/app/clients/auth.client"

import { useRouterActions } from "@/app/router/useRouterActions"

import { useLogin } from "@/app/mutation/auth.mutation"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaUser, FaLock, FaGithub, FaGoogle } from "react-icons/fa6"

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

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (Object.keys(validation).length > 0) return

        if (loginMutation.isPending || isPending) return

        const { success, errors } = validate(SignInSchema, formData)

        if (!success) {
            setValidation(errors)
            return
        }

        loginMutation.mutate(
            {
                username: formData.username,
                password: formData.password,
                authType: "credentials",
            },
            {
                onSuccess: () => {
                    navigateReplace('/home')
                },
                onError: (error) => {
                    alert(error.status, error.message);
                },
            }
        );
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
            return errors?.[name] ?
                {
                    ...prev,
                    [name]: errors[name]
                }
                :
                rest
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

        await authClient.loginWithProvider(value)
    }

    return (
        <Form className={`auth_form login_form ${active ? 'active' : ''}`} onSubmit={handleSubmit}>
            <header className="form_header">
                <Image src="/image/static/logo.svg" width={48} height={48} alt="CodeDev Logo" />
                <h2>Welcome Back</h2>
                <p>Sign in to continue to <Link href="/">CodeDev</Link></p>
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
                        read={isPending}
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
                        read={isPending}
                        isPassword={true}
                        onBlur={handleValidation}
                        onFocus={handleClearValidation}
                    />
                </div>
            </div>
            <div className="form_actions">
                <div className="form_options">
                    <label className="remember_me">
                        <input type="checkbox" tabIndex={1} />
                        <span>Remember me</span>
                    </label>
                    {/* <Link href="/auth" className="forgot_link">Forgot password?</Link> */}
                </div>

                <button type="submit" className="btn_submit" disabled={loginMutation.isPending || isPending}>
                    {loginMutation.isPending ? (
                        <LoadingContent scale={0.5} color="var(--white)" />
                    ) : (
                        'Sign In'
                    )}
                </button>
            </div>
            <footer className="form_footer">
                <div className="divider">
                    <span>or continue with</span>
                </div>

                <div className="social_buttons">
                    <button type="button"
                        className="social_btn"
                        onClick={() => handleCallback('github')}
                        disabled={loginMutation.isPending || isPending}
                    >
                        {
                            isPending === 'github' ?
                                <LoadingContent scale={0.5} />

                                :
                                <>
                                    <FaGithub />
                                    <span>Github</span>
                                </>
                        }
                    </button>
                    <button type="button"
                        className="social_btn"
                        onClick={() => handleCallback('google')}
                        disabled={loginMutation.isPending || isPending}
                    >
                        {
                            isPending === 'google' ?
                                <LoadingContent scale={0.5} />
                                :
                                <>
                                    <FaGoogle />
                                    <span>Google</span>
                                </>
                        }
                    </button>
                </div>

                <p className="switch_form">
                    Don't have an account?
                    <Link href="/auth" onClick={changeForm}>Create account</Link>
                </p>
            </footer>
        </Form>
    )
}