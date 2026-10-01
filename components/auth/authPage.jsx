'use client'
import { useState } from "react"
import Link from "next/link"

import Login from "./login"
import Signup from "./signup"

import { HiSparkles, HiCheckCircle } from "react-icons/hi2"
import { FaArrowLeft, FaGraduationCap, FaCode, FaChartLine } from "react-icons/fa6"

import '@/styles/auth/auth.css'

export default function AuthPage() {
    const [activeForm, setActiveForm] = useState('login')

    const isLogin = activeForm === 'login'
    const isSignup = activeForm === 'signup'

    const features = [
        {
            icon: <FaGraduationCap />,
            title: "Interactive Learning",
            desc: "Hands-on coding exercises with real-time feedback",
        },
        {
            icon: <FaCode />,
            title: "Modern Tech Stack",
            desc: "Master in-demand languages and industry frameworks",
        },
        {
            icon: <FaChartLine />,
            title: "Track Progress",
            desc: "Structured roadmaps, skill badges and milestones",
        },
    ]

    return (
        <main id="auth">
            {/* Quick Floating Back to Home Link */}
            <Link href="/" className="auth_back_home" title="Back to Homepage">
                <FaArrowLeft fontSize={14} />
                <span>Back to CodeDev</span>
            </Link>

            <div className="auth_wrapper">
                <div className="auth_card">
                    {/* Left/Main Forms Column */}
                    <section className="auth_forms">
                        {/* Segmented Tab Switcher */}
                        <div className="auth_tabs" role="tablist" aria-label="Authentication Options">
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isLogin}
                                className={`auth_tab ${isLogin ? 'active' : ''}`}
                                onClick={() => setActiveForm('login')}
                            >
                                Sign In
                            </button>
                            <button
                                type="button"
                                role="tab"
                                aria-selected={isSignup}
                                className={`auth_tab ${isSignup ? 'active' : ''}`}
                                onClick={() => setActiveForm('signup')}
                            >
                                Create Account
                            </button>
                        </div>

                        {/* Active Form */}
                        <div className="forms_container">
                            <Login
                                active={isLogin}
                                changeForm={() => setActiveForm('signup')}
                            />
                            <Signup
                                active={isSignup}
                                changeForm={() => setActiveForm('login')}
                            />
                        </div>
                    </section>

                    {/* Right Info Sidebar */}
                    <aside className="auth_sidebar">
                        <div className="sidebar_content">
                            <div className="sidebar_brand">
                                <span className="brand_icon_box">
                                    <HiSparkles className="brand_icon" />
                                </span>
                                <h3>CodeDev</h3>
                            </div>

                            <div className="sidebar_hero">
                                <div className="sidebar_image_wrap">
                                    <img src="/image/static/auth.png" alt="CodeDev Platform" />
                                </div>
                                <div className="sidebar_text">
                                    <h4>{isLogin ? 'Welcome Back!' : 'Start Your Journey'}</h4>
                                    <p>
                                        {isLogin
                                            ? 'Resume your coding path, pick up your streak and master new software engineering concepts.'
                                            : 'Create your free account today and join a thriving developer community.'}
                                    </p>
                                </div>
                            </div>

                            {/* Value Propositions */}
                            <ul className="sidebar_features">
                                {features.map((feat, idx) => (
                                    <li key={idx} className="feature_item">
                                        <span className="feature_icon">{feat.icon}</span>
                                        <div className="feature_details">
                                            <strong>{feat.title}</strong>
                                            <span>{feat.desc}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>

                            <button
                                type="button"
                                className="sidebar_btn"
                                onClick={() => setActiveForm(isLogin ? 'signup' : 'login')}
                            >
                                {isLogin ? 'New here? Create Account' : 'Already registered? Sign In'}
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        </main>
    )
}