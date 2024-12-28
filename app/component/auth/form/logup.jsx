import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

export default function Logup({ active, setForm }) {
    const [page, setPage] = useState(1);

    return (
        <div id="logup" style={active ? { top: '0' } : { top: '100%', display: 'none' }}>
            <div className="heading-logup">
                <h2>
                    Logup
                    <Link href={'/'} style={{display: 'flex', textDecoration: 'none', gap: '5px', alignItems: 'center'}}>
                        CodeDev
                        <Image src="/image/logo.svg" width={20} height={20} alt="logo" />
                    </Link>
                </h2>
                <span>
                    Welcome to the CodeDev, please fill in the form to create your account
                </span>
            </div>
            <div className="logup-page" style={{ transform: `translateX(-${(page - 1) * (100 / 2)}%)` }}>
                <Form id="logup-page-1">
                    <div className="logup-input">
                        <input type="text" placeholder="Surname" />
                        <input type="text" placeholder="Name" />
                    </div>
                    <input type="text" placeholder="Enter your email" />
                </Form>
                <Form id="logup-page-2">
                    <input type="text" placeholder="Username" />
                    <div className="auth-password">
                        <input type="password" placeholder="Password" />
                        <input type="password" placeholder="Confirm Password" />
                    </div>
                    <div className="auth-terms">
                        <input type="checkbox" />
                        <label>Agree to the terms of CodeDev</label>
                    </div>
                    <button type="submit" className="btn-logup">
                        Log up
                    </button>
                </Form>
            </div>
            <div className="footer-logup">
                <div className="navigate-logup">
                    <button type="button" style={page != 1 ? { color: 'var(--color_blue)', borderColor: 'var(--color_blue)' } : { borderColor: 'var(--color_black)' }} onClick={() => setPage(prev => prev - 1)} disabled={page == 1 ? true : false}>Previous</button >
                    <button type="button" style={page != 2 ? { color: 'var(--color_blue)', borderColor: 'var(--color_blue)' } : { borderColor: 'var(--color_black)' }} onClick={() => setPage(prev => prev + 1)} disabled={page == 2 ? true : false}>Next</button>
                </div>
                <div className="social-logup">
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
                <div className="login-auth">
                    Already have an account?
                    <Link href='/auth' onClick={setForm}>Login</Link>
                </div>
            </div>
        </div>
    )
}