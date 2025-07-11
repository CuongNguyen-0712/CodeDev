import { useState, startTransition } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { SignInDefinition } from "@/app/lib/definition"
import { useRouterActions } from "@/app/router/router"
import SignInService from "@/app/services/authService/signIn"
import { useAuth } from "@/app/contexts/authContext"
import { LoadingContent } from "../ui/loading"

import { FaUser, FaLock } from "react-icons/fa6";

export default function Login({
    active,
    changeForm,
    redirect,
    error,
    setError,
    setMessage
}) {
    const { navigateToHome } = useRouterActions();
    const { refreshSession } = useAuth();

    const [login, setLogin] = useState({
        name: '',
        pass: '',
        pending: false,
    })

    const submitLogin = async (e) => {
        e.preventDefault()

        setLogin({ ...login, pending: true })

        const check = SignInDefinition({ name: login.name.trim(), pass: login.pass })
        if (check.success) {
            try {
                const response = await SignInService({ name: login.name, pass: login.pass });

                if (response.status === 200 && response.success) {
                    redirect();
                    await refreshSession();
                    startTransition(() => {
                        navigateToHome();
                    })
                } else {
                    setLogin((prev) => ({ ...prev, pending: false }));
                    setMessage(response.message);
                }
            } catch (err) {
                setLogin((prev) => ({ ...prev, pending: false }));
            }
        }
        else {
            error(check.errors)
            setLogin({ ...login, pending: false })
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setLogin((prev) => ({ ...prev, [name]: value }))
        setError(name)
    }

    return (
        <>
            <Form id="login" onSubmit={submitLogin} style={active ? { top: '0' } : { top: '-100%', display: 'none' }}>
                <div className="heading-login">
                    <h2>
                        Login
                        <Link className="return_homepage" href="/" onClick={redirect}>
                            CodeDev
                            <Image src="/image/logo.svg" width={25} height={25} alt="logo" />
                        </Link>
                    </h2>
                    <span>
                        Welcome back to CodeDev
                    </span>
                </div>
                <div className="main-login">
                    <div className="login-input">
                        <div className={`field-input ${login.name ? 'has-content' : ''}`}>
                            <input type="text" id="nameLogin" name="name" value={login.name} onChange={handleChange} autoComplete="off" readOnly={login.pending} autoFocus />
                            <label>Username</label>
                            <FaUser className="icon" />
                        </div>
                        <div className={`field-input ${login.pass ? 'has-content' : ''}`}>
                            <input type="password" id="passLogin" name="pass" value={login.pass} onChange={handleChange} autoComplete="off" readOnly={login.pending} />
                            <label>Password</label>
                            <FaLock className='icon' />
                        </div>
                    </div>
                    <div className="login-help">
                        <span>
                            Having trouble logging in?
                            <Link href="/auth">Get help</Link>
                        </span>
                        <span>
                            <input type="checkbox" />
                            <label>Remember me</label>
                        </span>
                    </div>
                    <button type="submit" className="btn-login" disabled={login.pending}>
                        {
                            login.pending ?
                                <LoadingContent scale={0.5} color="var(--color_white)" />
                                :
                                <>
                                    Sign in
                                </>
                        }
                    </button>
                    <Link href="/auth" style={{ color: 'var(--color_black)', fontSize: '14px', fontWeight: '700', textDecoration: 'none' }}>Forgot your password ?</Link>
                </div>
                <div className="footer-login">
                    <p>Or sign in with</p>
                    <div className="social-login">
                        <button type="button">
                            <Image src="/image/google.ico" width={20} height={20} alt="facebook" />
                            <h4>Google</h4>
                        </button>
                        <button type="button">
                            <Image src="/image/facebook.ico" width={20} height={20} alt="facebook" />
                            <h4>Facebook</h4>
                        </button>
                        <button type="button">
                            <Image src="/image/apple.ico" width={20} height={20} alt="facebook" />
                            <h4>Apple ID</h4>
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