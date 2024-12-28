import { useState } from "react"

import Image from "next/image"
import Form from "next/form"
import Link from "next/link"

import RouterPush from "@/app/router/router"

export default function Login({ active, setForm }) {

    const { navigateToHome } = RouterPush()

    const [login, setLogin] = useState({
        name: '',
        pass: ''
    })

    const submitLogin = (e) => {
        e.preventDefault()
        navigateToHome()
    }

    return (
        <Form id="login" onSubmit={submitLogin} style={active ? { top: '0' } : { top: '-100%', display: 'none' }}>
            <div className="heading-login">
                <h2>
                    Login
                    <Link href={'/'} style={{ display: 'flex', textDecoration: 'none', gap: '5px', alignItems: 'center' }}>
                        CodeDev
                        <Image src="/image/logo.svg" width={20} height={20} alt="logo" />
                    </Link>
                </h2>
                <span>
                    Welcome back to CodeDev, please enter your email and password to login your account
                </span>
            </div>
            <div className="main-login">
                <input type="text" id="nameLogin" name="nameLogin" value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} placeholder="Username" />
                <input type="password" id="passLogin" name="passLogin" value={login.pass} onChange={(e) => setLogin({ ...login, pass: e.target.value })} placeholder="Password" />
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
                <button type="submit" className="btn-login" disabled={login.name && login.pass ? false : true}>
                    Sign in
                </button>
                <Link href="/auth" style={{ color: 'var(--color_black)', fontSize: '14px', fontWeight: '700', textDecoration: 'none' }}>Forgot your password ?</Link>
            </div>
            <div className="footer-login">
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