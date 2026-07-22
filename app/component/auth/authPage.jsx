'use client'
import { useState } from "react"

import Login from "./login"
import Signup from "./signup"

import AlertPush from "../ui/alert"

import { HiSparkles } from "react-icons/hi2"

export default function AuthPage() {
    const [activeForm, setActiveForm] = useState('login')
    const [alert, setAlert] = useState(null)

    const isLogin = activeForm === 'login'
    const isSignup = activeForm === 'signup'

    return (
        <main id="auth">
            <div className="auth_wrapper">
                <div className="auth_card">
                    <section className="auth_forms">
                        <Login
                            active={isLogin}
                            changeForm={() => setActiveForm('signup')}
                        />
                        <Signup
                            active={isSignup}
                            changeForm={() => setActiveForm('login')}
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
        </main>
    )
}        