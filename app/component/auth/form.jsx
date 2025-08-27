import { useEffect, useState } from "react"

import useOutsite from "@/app/hooks/useOutside"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"

import { IoIosWarning, IoMdClose, IoIosCloseCircle } from "react-icons/io"
import { FaRegCircleCheck } from "react-icons/fa6";

export default function Form() {
    const [form, setForm] = useState('login')

    const [state, setState] = useState({
        error: {
            login: null,
            signup: null
        },
        message: {
            login: null,
            signup: null
        },
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

    useEffect(() => {
        if (!state.message[form]) return

        const timer = setTimeout(() => {
            setState((prev) => ({
                ...prev,
                message: {
                    ...prev.message,
                    [form]: null
                }
            }))
        }, 5000)

        return () => clearTimeout(timer)
    }, [state.message[form]])

    return (
        <main id="auth">
            {redirect ?
                <LoadingRedirect />
                :
                <div className="auth-container">
                    <section className="auth-form">
                        <div className="heading-form" >
                            <button
                                className={`${form === 'login' ? 'active' : ''}`}
                                onClick={() => setForm('login')}>
                                Login
                            </button>
                            <button
                                className={`${form === 'signup' ? 'active' : ''}`}
                                onClick={() => setForm('signup')}>
                                Signup
                            </button>
                            <span className="focus" style={{ transform: form === 'login' && 'translateX(10px)' || form === 'signup' && 'translateX(calc(100% + 30px))' }}></span>
                        </div>
                        <div className="main-form">
                            <Login
                                active={form === 'login'}
                                changeForm={() => setForm('signup')}
                                redirect={() => setRedirect(true)}
                                error={(data) => setState((prev) => ({ ...prev, error: { ...prev.error, login: data } }))}
                                setError={(data) => handleSetError(data)}
                                setMessage={(data) => setState((prev) => ({ ...prev, message: { ...prev.message, login: data } }))}
                            />
                            <Logup
                                active={form === 'signup'}
                                changeForm={() => setForm('login')}
                                redirect={() => setRedirect(true)}
                                error={(data) => setState((prev) => ({ ...prev, error: { ...prev.error, signup: data } }))}
                                setError={(data) => handleSetError(data)}
                                setMessage={(data) => setState((prev) => ({ ...prev, message: { ...prev.message, signup: data } }))}
                            />
                        </div>
                    </section>
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
                        (state.message[form] && Object.keys(state.message[form] ?? {}).length > 0) &&
                        <div className="message" style={state.message[form].status === 200 ? { background: 'var(--color_green)' } : { background: 'var(--color_red)' }} >
                            {
                                state.message[form].status === 200 ?
                                    <FaRegCircleCheck fontSize={17} />
                                    :
                                    <IoIosCloseCircle fontSize={17} />
                            }
                            <p>{state.message[form].message}</p>
                        </div>
                    }
                </div>
            }
        </main>
    )
}        