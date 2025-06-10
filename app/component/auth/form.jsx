import { useState } from "react"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"

export default function Form() {

    const [form, setForm] = useState({
        login: true,
        signup: false
    })

    const [redirect, setRedirect] = useState(false)

    return (
        <main id="auth">
            {redirect ?
                <LoadingRedirect />
                :
                <div className="auth-container">
                    <section className="auth-form">
                        <div className="heading-form" >
                            <button
                                className={`${form.login ? 'active' : ''}`}
                                onClick={() => setForm({ login: true, signup: false })}>
                                Login
                            </button>
                            <button
                                className={`${form.signup ? 'active' : ''}`}
                                onClick={() => setForm({ login: false, signup: true })}>
                                Signup
                            </button>
                            <span className="focus" style={{ transform: form.login && 'translateX(10px)' || form.signup && 'translateX(calc(100% + 30px))' }}></span>
                        </div>
                        <div className="main-form">
                            <Login active={form.login} changeForm={() => setForm({ login: false, signup: true })} redirect={() => setRedirect(true)} />
                            <Logup active={form.signup} changeForm={() => setForm({ login: true, signup: false })} redirect={() => setRedirect(true)} />
                        </div>
                    </section>
                </div>
            }
        </main>
    )
}        