'use client'
import { useState } from "react"

import Login from "./login"
import Logup from "./logup"
import { LoadingRedirect } from "../ui/loading"
import AlertPush from "../ui/alert"

import { HiSparkles } from "react-icons/hi2"

export default function Form() {
    const [activeForm, setActiveForm] = useState('login')
    const [alert, setAlert] = useState(null)
    const [isRedirecting, setIsRedirecting] = useState(false)

    const isLogin = activeForm === 'login'
    const isSignup = activeForm === 'signup'

    return (
        <main id="auth">
            {isRedirecting ? (
                <LoadingRedirect />
            ) : (
                <div className="auth_wrapper">
                    <div className="auth_card">
                        <section className="auth_forms">
                            <Login
                                active={isLogin}
                                changeForm={() => setActiveForm('signup')}
                                redirect={() => setIsRedirecting(true)}
                                setAlert={setAlert}
                            />
                            <Logup
                                active={isSignup}
                                changeForm={() => setActiveForm('login')}
                                redirect={() => setIsRedirecting(true)}
                                setAlert={setAlert}
                            />
                        </section>

                        <aside className="auth_sidebar">
                            <div className="sidebar_content">
                                <div className="sidebar_brand">
                                    <HiSparkles className="brand_icon" />
                                    <h3>CodeDev</h3>
                                </div>
                                <div className="sidebar_image">
                                    <img src="/image/static/auth.png" alt="Authentication" />
                                </div>
                                <div className="sidebar_text">
                                    <h4>{isLogin ? 'New here?' : 'Already a member?'}</h4>
                                    <p>
                                        {isLogin
                                            ? 'Join us and start your coding journey today!'
                                            : 'Welcome back! Sign in to continue your progress.'}
                                    </p>
                                </div>
                                <button
                                    className="sidebar_btn"
                                    onClick={() => setActiveForm(isLogin ? 'signup' : 'login')}
                                >
                                    {isLogin ? 'Create Account' : 'Sign In'}
                                </button>
                            </div>
                        </aside>
                    </div>

                    <AlertPush
                        status={alert?.status}
                        message={alert?.message}
                        reset={() => setAlert(null)}
                    />
                </div>
            )}
        </main>
    )
}        