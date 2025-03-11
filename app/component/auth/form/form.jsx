import { useState } from "react"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../../ui/loading"
import { useSize } from "@/app/contexts/sizeContext"

export default function Form() {
    const [form, setForm] = useState({ login: true, register: false })
    const [redirect, setRedirect] = useState(false)
    const { size } = useSize();

    return (
        <main id="auth" style={size.height < 550 ? { alignItems: 'flex-start' } : { alignItems: 'center' }}>
            {
                redirect ?
                    <div id="loadAuth">
                        <LoadingRedirect />
                    </div>
                    :
                    <section className="auth-form">
                        <div className="heading-form" >
                            <button
                                className={`${form.login ? 'active' : ''}`}
                                onClick={() => setForm({ login: true, register: false })}>
                                Login
                            </button>
                            <button
                                className={`${form.register ? 'active' : ''}`}
                                onClick={() => setForm({ login: false, register: true })}>
                                Register
                            </button>
                            <span className="focus" style={{ transform: form.login && 'translateX(10px)' || form.register && 'translateX(calc(100% + 30px))' }}></span>
                        </div>
                        <div className="main-form">
                            <Login active={form.login} setForm={() => setForm({ login: false, register: true })} redirect={() => setRedirect(true)} />
                            <Logup active={form.register} setForm={() => setForm({ login: true, register: false })} redirect={() => setRedirect(true)} />
                        </div>
                    </section>
            }
        </main>
    )
}        