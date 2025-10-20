import { useState } from "react"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"
import AlertPush from "../ui/alert"

export default function Form() {
    const [form, setForm] = useState('login')

    const [alert, setAlert] = useState(null)

    const [redirect, setRedirect] = useState(false)

    return (
        <main id="auth">
            {redirect ?
                <LoadingRedirect />
                :
                <div className="auth-container">
                    <div className="container">
                        <section className="auth-form">
                            <Login
                                active={form === 'login'}
                                changeForm={() => setForm('signup')}
                                redirect={() => setRedirect(true)}
                                setAlert={(data) => setAlert(data)}
                            />
                            <Logup
                                active={form === 'signup'}
                                changeForm={() => setForm('login')}
                                redirect={() => setRedirect(true)}
                                setAlert={(data) => setAlert(data)}
                            />
                        </section>
                        <section className="beside_auth">
                            <div className="image_frame">
                                <img src="/image/static/auth.png" alt="image_auth" />
                            </div>
                            <div className="navigate_btns">
                                {
                                    form === 'signup' &&
                                    <button
                                        id="navigate_login"
                                        onClick={() => setForm('login')}
                                    >
                                        Log in
                                    </button>
                                }
                                {
                                    form === 'login' &&
                                    <button
                                        id="navigate_signup"
                                        onClick={() => setForm('signup')}
                                    >
                                        Sign up
                                    </button>
                                }
                            </div>
                        </section>
                    </div>
                    {
                        alert &&
                        <AlertPush
                            status={alert.status}
                            message={alert.message}
                            reset={() =>
                                setAlert(null)
                            }
                        />
                    }
                </div>
            }
        </main>
    )
}        