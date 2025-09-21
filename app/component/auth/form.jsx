import { useState } from "react"

import useOutsite from "@/app/hooks/useOutside"

import Image from "next/image"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"
import AlertPush from "../ui/alert"

import { IoIosWarning, IoMdClose } from "react-icons/io"

export default function Form() {
    const [form, setForm] = useState('login')

    const [state, setState] = useState({
        error: {
            login: null,
            signup: null
        },
        alert: null,
        hide: false
    })

    const [redirect, setRedirect] = useState(false)

    const ref = useOutsite({
        stateOutside: state.hide,
        setStateOutside: () => setState((prev) => ({
            ...prev,
            hide: true
        }))
    })

    const handleSetError = (data) => {
        if (state.error[form] === null) return;

        if (Object.entries(state.error[form]).length === 0) {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    [form]: null
                },
            }))
        }
        else {
            setState((prev) => ({
                ...prev,
                error: {
                    ...prev.error,
                    [form]: Object.fromEntries(
                        Object.entries(state.error[form]).filter(([key]) => key !== data)
                    )
                }
            }))
        }
    }

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
                                error={(data) => setState((prev) => ({ ...prev, error: { ...prev.error, login: data } }))}
                                setError={(data) => handleSetError(data)}
                                setAlert={(data) => setState((prev) => ({ ...prev, alert: data }))}
                            />
                            <Logup
                                active={form === 'signup'}
                                changeForm={() => setForm('login')}
                                redirect={() => setRedirect(true)}
                                error={(data) => setState((prev) => ({ ...prev, error: { ...prev.error, signup: data } }))}
                                setError={(data) => handleSetError(data)}
                                setAlert={(data) => setState((prev) => ({ ...prev, alert: data }))}
                            />
                        </section>
                        <section className="beside_auth">
                            <div className="image_frame">
                                <Image
                                    src="/image/static/login.png"
                                    alt='image_auth'
                                    width={300}
                                    height={200}
                                />
                            </div>
                            <h3>
                                Improve and develop your coding
                            </h3>
                            <div className="navigate_btns">
                                <button
                                    id="navigate_login"
                                    onClick={() => setForm('login')}
                                >
                                    Login
                                </button>
                                <button
                                    id="navigate_signup"
                                    onClick={() => setForm('signup')}
                                >
                                    Signup
                                </button>
                            </div>
                        </section>
                    </div>
                    {
                        (state.error[form] && Object.keys(state.error[form] ?? {}).length > 0) &&
                        <div id="warning_notification">
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setState((prev) => ({
                                        ...prev,
                                        hide: !prev.hide
                                    }))
                                }}
                                style={
                                    state.hide ?
                                        { background: 'var(--color_orange)' }
                                        :
                                        { background: 'var(--color_black)' }
                                }
                            >
                                {
                                    state.hide ?
                                        <IoIosWarning />
                                        :
                                        <IoMdClose />
                                }
                            </button>
                            <div className={`content_warning ${state.hide ? 'hide' : ''}`} ref={ref}>
                                {Object.keys(state.error[form]).map((key, index) => (
                                    <p key={index}>
                                        <IoIosWarning style={{ fontSize: '17px', color: 'var(--color_orange)' }} />
                                        {state.error[form][key]}
                                    </p>
                                ))}
                            </div>
                        </div>
                    }
                    {
                        state.alert &&
                        <AlertPush
                            status={state.alert.status}
                            message={state.alert.message}
                            reset={() =>
                                setState((prev) => ({
                                    ...prev,
                                    alert: null,
                                }))
                            }
                        />
                    }
                </div>
            }
        </main>
    )
}        