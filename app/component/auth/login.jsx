import { useState } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { validate } from "@/app/helper/validate"

import { SignInSchema } from "@/app/lib/definition"

import { signIn } from "next-auth/react"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaUser, FaLock, FaGithub, FaGoogle } from "react-icons/fa6"

export default function Login({ active, changeForm, setAlert, callback }) {
    const [formData, setFormData] = useState({
        name: '',
        pass: '',
    })

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(null)

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (Object.keys(validation).length > 0) return

        setIsPending('credentials')

        const { success, errors } = validate(SignInSchema, formData)

        if (success) {
            try {
                await signIn("credentials", {
                    username: formData.name.trim(),
                    password: formData.pass,
                    callbackUrl: '/home',
                })
            } catch (err) {
                setAlert({
                    status: err.response?.status || 500,
                    message: "Login failed, please try again"
                });
                setIsPending(null)
            }
        } else {
            setValidation(errors)
            setIsPending(null)
        }
    }

    const handleValidation = ({ name, value }) => {
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
        handleValidation({ name, value })
    }

    const handleClear = (name) => {
        setFormData((prev) => ({ ...prev, [name]: '' }))
        handleValidation({ name, value: '' })
    }

    const handleCallback = async (value) => {
        setIsPending(value)

        try {
            await callback(value)
        } catch (err) {
            setAlert({
                status: err.response?.status || 500,
                message: 'Authentication failed, try again'
            })
            setIsPending(null)
        }
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
                        name="name"
                        label="Username"
                        type="text"
                        value={formData.name}
                        onChange={handleChange}
                        error={validation?.name}
                        icon={<FaUser className="icon" />}
                        reset={handleClear}
                        read={isPending}
                    />
                    <InputGroup
                        name="pass"
                        label="Password"
                        type="password"
                        value={formData.pass}
                        onChange={handleChange}
                        error={validation?.pass}
                        icon={<FaLock className="icon" />}
                        reset={handleClear}
                        read={isPending}
                        isPassword={true}
                    />
                </div>

                <div className="form_options">
                    <label className="remember_me">
                        <input type="checkbox" tabIndex={1} />
                        <span>Remember me</span>
                    </label>
                    <Link href="/auth" className="forgot_link">Forgot password?</Link>
                </div>

                <button type="submit" className="btn_submit" disabled={isPending}>
                    {isPending === 'credentials' ? (
                        <LoadingContent scale={0.5} color="var(--color_white)" />
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
                        disabled={isPending}
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
                        disabled={isPending}
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