import { useState } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { useAuth } from "@/app/contexts/authContext"
import { useRouterActions } from "@/app/router/router"
import { SignInDefinition } from "@/app/lib/definition"
import SignInService from "@/app/services/authService/signIn"

import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaUser, FaLock } from "react-icons/fa6";

export default function Login({
    active,
    changeForm,
    redirect,
    setAlert
}) {
    const { navigateToHome } = useRouterActions();
    const { refreshSession } = useAuth();

    const [login, setLogin] = useState({
        name: '',
        pass: '',
        validation: {},
        pending: false,
    })

    const submitLogin = async (e) => {
        e.preventDefault()

        if (Object.keys(login.validation).length > 0) return

        setLogin({ ...login, pending: true })

        const check = SignInDefinition({ name: login.name.trim(), pass: login.pass })
        if (check.success) {
            try {
                const response = await SignInService({ name: login.name, pass: login.pass });

                if (response.status === 200 && response.success) {
                    await refreshSession();
                    setAlert({ status: response.status, message: response.message });
                    setTimeout(() => {
                        redirect();
                        navigateToHome();
                    }, 2000)
                } else {
                    setLogin((prev) => ({ ...prev, pending: false }));
                    setAlert({ status: response.status, message: response.message });
                }
            } catch (err) {
                setAlert({ status: 500, message: err.message });
                setLogin((prev) => ({ ...prev, pending: false }));
            }
        }
        else {
            setLogin({ ...login, validation: check.errors, pending: false })
        }
    }

    const handleValidation = ({ name, value = '' }) => {
        const { errors } = SignInDefinition({ [name]: value })

        setLogin((prev) => {
            const { [name]: removed, ...rest } = prev.validation || {};

            return {
                ...prev,
                validation: errors?.[name] ?
                    {
                        ...prev.validation,
                        [name]: errors[name]
                    }
                    :
                    {
                        ...rest
                    }
            }
        })
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setLogin((prev) => ({ ...prev, [name]: value }))
        handleValidation({ name, value })
    }

    const handleClear = (name) => {
        setLogin((prev) => ({ ...prev, [name]: '' }))
        handleValidation({ name: name })
    }

    return (
        <>
            <Form
                className={`login ${active ? 'pop' : ''}`}
                onSubmit={submitLogin}
            >
                <div className="heading-login">
                    <Image src="/image/static/logo.svg" width={50} height={50} alt="logo" />
                    <h2>
                        Login
                        <Link className="return_homepage" href="/" onClick={redirect}>
                            CodeDev
                        </Link>
                    </h2>
                    <span>
                        Welcome back to CodeDev
                    </span>
                </div>
                <div className="main-login">
                    <div className="login-input">
                        <InputGroup
                            name='name'
                            label="Username"
                            type="text"
                            value={login.name}
                            onChange={handleChange}
                            error={login.validation?.name}
                            icon={<FaUser className='icon' />}
                            reset={(name) => handleClear(name)}
                            read={login.pending}
                        />
                        <InputGroup
                            name='pass'
                            label="Password"
                            type="password"
                            value={login.pass}
                            onChange={handleChange}
                            error={login.validation?.pass}
                            icon={<FaLock className='icon' />}
                            reset={(name) => handleClear(name)}
                            read={login.pending}
                            isPassword={true}
                        />
                    </div>
                    <div className="login-help">
                        <span>
                            Having trouble logging in?
                            <Link href="/auth" tabIndex={1}>Get help</Link>
                        </span>
                        <span>
                            <input type="checkbox" tabIndex={1} />
                            <label>Remember me</label>
                        </span>
                    </div>
                    <button type="submit" className="btn-login" disabled={login.pending}>
                        {
                            login.pending ?
                                <LoadingContent scale={0.5} color="var(--color_white)" />
                                :
                                <>
                                    Log in
                                </>
                        }
                    </button>
                    <Link href="/auth" id="forgot_password">Forgot your password ?</Link>
                </div>
                <div className="footer-login">
                    <p>Or log in with</p>
                    <div className="social-login">
                        <button type="button">
                            <Image src="/image/static/github.ico" width={20} height={20} alt="github" />
                            <h4>Github</h4>
                        </button>
                        <button type="button">
                            <Image src="/image/static/google.ico" width={20} height={20} alt="facebook" />
                            <h4>Google</h4>
                        </button>
                    </div>
                    <div className="register-auth">
                        Don't have an account ?
                        <Link href='/auth' onClick={changeForm}>Create an account</Link>
                    </div>
                </div>
            </Form>
        </>
    )
}