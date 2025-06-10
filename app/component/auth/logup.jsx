import { useState, useEffect } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { SignUpDefinition } from "@/app/lib/definition"
import SignUpService from "@/app/services/authService/signUp"

import { FaArrowRight, FaCircleNotch, FaArrowLeft, FaPhone } from "react-icons/fa";
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword } from "react-icons/md";
import { FaUser, FaLock } from "react-icons/fa6";
import { IoIosWarning, IoMdClose, IoIosCloseCircle } from "react-icons/io"

export default function Logup({ active, changeForm, redirect }) {
    const [page, setPage] = useState(1);

    const [form, setForm] = useState({
        surname: '',
        name: '',
        email: '',
        phone: '',
        username: '',
        password: '',
        re_password: '',
        agree: false
    })

    const [state, setState] = useState({
        pending: false,
        error: null,
        hide: false,
        message: null,
    })

    const handleSubmit = async (e) => {
        e.preventDefault();

        setState((prev) => ({ ...prev, pending: true }));

        const check = SignUpDefinition(form);
        if (check.success) {
            try {
                const { re_password, agree, ...data } = form
                const res = await SignUpService(data);
                if (res.status === 200 && res.success) {
                    setState((prev) => ({ ...prev, pending: false }));
                    setForm({ surname: '', name: '', email: '', phone: '', username: '', password: '', re_password: '', agree: false });
                    changeForm();
                } else {
                    setState((prev) => ({ ...prev, pending: false, message: res.message }));
                }
            } catch (err) {
                console.error(err)
                setState((prev) => ({ ...prev, pending: false, message: 'Server error, try again' }));
            }
        }
        else {
            setState((prev) => ({ ...prev, pending: false, error: check.errors }))
        }
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        setState((prev) => ({ ...prev, error: null, hide: false }));
    }

    useEffect(() => {
        if (!state.message) return;

        const timer = setTimeout(() => {
            setState((prev) => ({ ...prev, message: null }))
        }, 2000)
        return () => clearTimeout(timer)
    }, [state.message])

    return (
        <>
            <Form id="logup" onSubmit={handleSubmit} style={active ? { top: '0' } : { top: '100%', display: 'none' }}>
                <div className="heading-logup">
                    <h2>
                        Signup
                        <Link className="return_homepage" href="/" onClick={redirect}>
                            CodeDev
                            <Image src="/image/logo.svg" width={25} height={25} alt="logo" />
                        </Link>
                    </h2>
                    <span>
                        Welcome to the CodeDev
                    </span>
                </div>
                <div className="logup-page" style={{ transform: `translateX(-${(page - 1) * (100 / 2)}%)` }}>
                    <div id="logup-page-1">
                        <div className="logup-input">
                            <div className={`field-input ${form.surname ? 'has-content' : ''}`}>
                                <input type="text" name="surname" value={form.surname} onChange={handleChange} autoComplete="off" />
                                <label>Surname</label>
                                <MdModeEdit className="icon" />
                            </div>
                            <div className={`field-input ${form.name ? 'has-content' : ''}`}>
                                <input type="text" name="name" value={form.name} onChange={handleChange} autoComplete="off" />
                                <label>Name</label>
                                <MdModeEdit className="icon" />
                            </div>
                        </div>
                        <div className={`field-input ${form.email ? 'has-content' : ''}`}>
                            <input type="text" name="email" value={form.email} onChange={handleChange} autoComplete="off" />
                            <label>Enter your email</label>
                            <MdAlternateEmail className='icon' />
                        </div>
                        <div className={`field-input ${form.phone ? 'has-content' : ''}`}>
                            <input type="text" name="phone" value={form.phone} onChange={handleChange} autoComplete="off" />
                            <label>Enter your phone</label>
                            <FaPhone className="icon" />
                        </div>
                    </div>
                    <div id="logup-page-2">
                        <div className={`field-input ${form.username ? 'has-content' : ''}`}>
                            <input type="text" name="username" value={form.username} onChange={handleChange} autoComplete="off" />
                            <label>Enter create username</label>
                            <FaUser className="icon" />
                        </div>
                        <div className="auth-password">
                            <div className={`field-input ${form.password ? 'has-content' : ''}`}>
                                <input type="password" name="password" value={form.password} onChange={handleChange} autoComplete="off" />
                                <label>Enter password</label>
                                <FaLock className="icon" />
                            </div>
                            <div className={`field-input ${form.re_password ? 'has-content' : ''}`}>
                                <input type="password" name="re_password" value={form.re_password} onChange={handleChange} autoComplete="off" />
                                <label>Re-enter password</label>
                                <MdOutlinePassword className='icon' />
                            </div>
                        </div>
                        <div className="auth-terms">
                            <input type="checkbox" checked={form.agree} name="agree" onChange={handleChange} />
                            <label>Agree to the terms of CodeDev</label>
                        </div>
                        <button type="submit" className="btn-logup" disabled={state.pending}>
                            {
                                state.pending ?
                                    <FaCircleNotch className="handling" style={{ fontSize: '20px' }} />
                                    :
                                    <>
                                        Sign up
                                    </>
                            }
                        </button>
                    </div>
                </div>
                <div className="footer-logup">
                    <div className="navigate-logup">
                        <button type="button" style={page != 1 ? { color: 'var(--color_white)', background: 'var(--color_blue)', cursor: 'pointer' } : { borderColor: 'var(--color_black)', cursor: 'not-allowed' }} onClick={() => setPage(prev => prev - 1)} disabled={page == 1 ? true : false}>
                            <FaArrowLeft />
                        </button >
                        <button type="button" style={page != 2 ? { color: 'var(--color_white)', background: 'var(--color_blue)', cursor: 'pointer' } : { borderColor: 'var(--color_black)', cursor: 'not-allowed' }} onClick={() => setPage(prev => prev + 1)} disabled={page == 2 ? true : false}>
                            <FaArrowRight />
                        </button>
                    </div>
                    <p>Or sign up with</p>
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
                        <Link href='/auth' onClick={changeForm}>Login</Link>
                    </div>
                </div>
            </Form>
            {
                state.error &&
                <div id="warning_notification">
                    <button onClick={() => setState((prev) => ({ ...prev, hide: !state.hide }))} style={state.hide ? { background: 'var(--color_orange)' } : { background: 'var(--color_black)' }}>
                        {
                            state.hide ?
                                <IoIosWarning />
                                :
                                <IoMdClose />
                        }
                    </button>
                    <div className={`content_warning ${state.hide ? 'hide' : ''}`}>
                        {Object.keys(state.error).map((key, index) => (
                            <p key={index}>
                                <IoIosWarning style={{ fontSize: '17px', color: 'var(--color_orange)' }} />
                                {state.error[key]}
                            </p>
                        ))}
                    </div>
                </div>
            }
            {
                state.message &&
                <div className="error">
                    <IoIosCloseCircle style={{ fontSize: '17px' }} />
                    <p>{state?.message}</p>
                </div>
            }
        </>
    )
}