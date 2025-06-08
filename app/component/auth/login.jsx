import { useState, useEffect } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import { SignInDefinition } from "@/app/lib/definition"
import { useRouterActions } from "@/app/router/router"
import SignInService from "@/app/services/authService/signIn"

import { FaUser, FaLock } from "react-icons/fa6";
import { FaCircleNotch } from "react-icons/fa";
import { MdError } from "react-icons/md";

export default function Login({ active, setForm, redirect }) {
    const { navigateToHome } = useRouterActions();

    const [login, setLogin] = useState({
        name: '',
        pass: '',
        pending: false,
        error: null,
        message: null
    })

    const submitLogin = async (e) => {
        e.preventDefault()

        setLogin({ ...login, pending: true })

        const check = SignInDefinition({ name: login.name, pass: login.pass })
        if (check.success) {
            try {
                const response = await SignInService({ name: login.name, pass: login.pass });

                if (response.status === 200 && response.success) {
                    redirect();
                    navigateToHome();
                } else {
                    setLogin((prev) => ({ ...prev, message: response.message, pending: false }));
                }
            } catch (err) {
                setLogin((prev) => ({ ...prev, message: 'Server error, try again', pending: false }));
            }
        }
        else {
            setLogin({ ...login, pending: false, error: check.error })
        }
    }

    const handleChange = (e) => {
        const { name, value } = e.target
        setLogin((prev) => ({
            ...prev,
            [name]: value,
            error: null,
        }));
    }

    useEffect(() => {
        if (!login.message) return;
        const timer = setTimeout(() => {
            setLogin((prev) => ({ ...prev, message: null }));
        }, 2000);
        return () => clearTimeout(timer);
    }, [login.message]);


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
                        Welcome back to CodeDev, please enter your email and password to login your account
                    </span>
                </div>
                <div className="main-login">
                    <div className="login-input">
                        <div className={`field-input ${login.name ? 'has-content' : ''}`}>
                            <input type="text" id="nameLogin" name="name" value={login.name} onChange={(e) => handleChange(e)} autoComplete="off" />
                            <label>Username</label>
                            <FaUser className="icon" />
                        </div>
                        <div className={`field-input ${login.pass ? 'has-content' : ''}`}>
                            <input type="password" id="passLogin" name="pass" value={login.pass} onChange={(e) => handleChange(e)} autoComplete="off" />
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
            {
                login.message &&
                <div className="error">
                    <MdError />
                    <p>{login?.message}</p>
                </div>
            }
        </>
    )
}