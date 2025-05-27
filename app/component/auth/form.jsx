import { useState } from "react"
import { useSearchParams } from "next/navigation"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"
import { useSize } from "@/app/contexts/sizeContext"

export default function Form() {
    const params = useSearchParams();
    const { size } = useSize();

    const [form, setForm] = useState({
        login: params.get('login') ?? true,
        signup: params.get('signup') ?? false
    })
    const [redirect, setRedirect] = useState(false)

    return (
        <main id="auth">
            {redirect ?
                <LoadingRedirect />
                :
                <div className="auth-container" style={size.height < 600 ? { alignItems: 'flex-start' } : { alignItems: 'center' }}>
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
                            <Login active={form.login} setForm={() => setForm({ login: false, signup: true })} redirect={() => setRedirect(true)} />
                            <Logup active={form.signup} setForm={() => setForm({ login: true, signup: false })} redirect={() => setRedirect(true)} />
                        </div>
                    </section>
                </div>
            }
        </main>
    )
}        