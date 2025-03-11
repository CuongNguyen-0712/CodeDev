import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { FaArrowRight, FaArrowLeft } from "react-icons/fa";

export default function Logup({ active, setForm, redirect }) {
    const [page, setPage] = useState(1);

    return (
        <div id="logup" style={active ? { top: '0' } : { top: '100%', display: 'none' }}>
            <div className="heading-logup">
                <h2>
                    Logup
                    <Link href={'/'} onClick={redirect} style={{ display: 'flex', textDecoration: 'none', gap: '5px', alignItems: 'center' }}>
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
                        <div className="field-input">
                            <input type="text" />
                            <label>Surname</label>
                        </div>
                        <div className="field-input">
                            <input type="text" />
                            <label>Name</label>
                        </div>
                    </div>
                    <div className="field-input">
                        <input type="text" />
                        <label>Enter your email</label>
                    </div>
                    <div className="field-input">
                        <input type="text" />
                        <label>Enter your phone</label>
                    </div>
                </Form>
                <Form id="logup-page-2">
                    <div className="field-input">
                        <input type="text" />
                        <label>Enter create username</label>
                    </div>
                    <div className="auth-password">
                        <div className="field-input">
                            <input type="password" />
                            <label>Enter password</label>
                        </div>
                        <div className="field-input">
                            <input type="password" />
                            <label>Re-enter password</label>
                        </div>
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
                    <button type="button" style={page != 1 ? { color: 'var(--color_white)', background: 'var(--color_blue)' } : { borderColor: 'var(--color_black)' }} onClick={() => setPage(prev => prev - 1)} disabled={page == 1 ? true : false}>
                        <FaArrowLeft />
                    </button >
                    <button type="button" style={page != 2 ? { color: 'var(--color_white)', background: 'var(--color_blue)' } : { borderColor: 'var(--color_black)' }} onClick={() => setPage(prev => prev + 1)} disabled={page == 2 ? true : false}>
                        <FaArrowRight />
                    </button>
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