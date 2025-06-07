import { useState } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { SignInDefinition } from "@/app/lib/definition"
import { useRouterActions } from "@/app/router/router"
import SignInService from "@/app/services/authService/signIn"

import { FaUser, FaLock } from "react-icons/fa6";
import { FaCircleNotch } from "react-icons/fa";
import { IoIosWarning } from "react-icons/io";

export default function Login({ active, setForm, redirect }) {
    const { navigateToHome } = useRouterActions();

    const [login, setLogin] = useState({
        name: '',
        pass: '',
        pending: false,
        error: null,
    })

    const submitLogin = async (e) => {
        e.preventDefault()

        setLogin({ ...login, pending: true })

        const res = SignInDefinition({ name: login.name, pass: login.pass })
        if (res.success) {
            const res = await SignInService({ name: login.name, pass: login.pass })
            if (res.status == 200 && res.success) {
                redirect()
                navigateToHome();
            }
            else {
                setLogin({ ...login, error: res.message, pending: false })
            }
        }
        else {
            setLogin({ ...login, error: res.error })
        }
    }

    return (
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
                    Welcome back to CodeDev, please enter your email and password to login your account
                </span>
            </div>
            <div className="main-login">
                <div className="login-input">
                    <div className={`field-input ${login.name ? 'has-content' : ''}`}>
                        <input type="text" id="nameLogin" name="nameLogin" value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} autoComplete="off" />
                        <label>Username</label>
                        <FaUser className="icon" />
                        {
                            (login.error && login.error.name) &&
                            <div className="warning">
                                <IoIosWarning className="warning_icon" />
                                <p>{login.error.name}</p>
                            </div>
                        }
                    </div>
                    <div className={`field-input ${login.pass ? 'has-content' : ''}`}>
                        <input type="password" id="passLogin" name="passLogin" value={login.pass} onChange={(e) => setLogin({ ...login, pass: e.target.value })} autoComplete="off" />
                        <label>Password</label>
                        <FaLock className='icon' />
                        {
                            (login.error && login.error.pass) &&
                            <div className="warning">
                                <IoIosWarning className="warning_icon" />
                                <p>{login.error.pass}</p>
                            </div>

                        }
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
                            <FaCircleNotch className="handling" style={{ fontSize: '20px' }} />
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
                    <Link href='/auth' onClick={setForm}>Create an account</Link>
                </div>
            </div>
        </Form>
    )
}