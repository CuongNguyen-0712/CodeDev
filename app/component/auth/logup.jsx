import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { SignUpDefinition } from "@/app/lib/definition"
import SignUpService from "@/app/services/authService/signUp"
import { LoadingContent } from "../ui/loading"

import { FaArrowRight, FaArrowLeft, FaPhone } from "react-icons/fa";
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword } from "react-icons/md";
import { FaUser, FaLock } from "react-icons/fa6";

export default function Logup({
    active,
    changeForm,
    redirect,
    error,
    setError,
    setMessage
}) {
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
                    setMessage({ status: res.status, message: res.message });
                    setState((prev) => ({ ...prev, pending: false }));
                    setForm({ surname: '', name: '', email: '', phone: '', username: '', password: '', re_password: '', agree: false });
                    changeForm();
                } else {
                    setState((prev) => ({ ...prev, pending: false }));
                    setMessage({ status: res.status, message: res.message });
                }
            } catch (err) {
                setState((prev) => ({ ...prev, pending: false }));
                setMessage({ statsu: 500, message: err.message });
            }
        }
        else {
            error(check.errors)
            setState((prev) => ({ ...prev, pending: false }))
        }
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        setError(name);
    }

    return (
        <>
            <Form id="logup" onSubmit={handleSubmit} style={active ? { top: '0' } : { top: '100%', display: 'none' }}>
                <div className="heading-logup">
                    <h2>
                        Signup
                        <Link className="return_homepage" href="/" onClick={redirect}>
                            CodeDev
                            <Image src="/image/static/logo.svg" width={25} height={25} alt="logo" />
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
                                <input type="text" name="surname" value={form.surname} onChange={handleChange} autoComplete="off" tabIndex={page === 1 ? 1 : -1} />
                                <label>Surname</label>
                                <MdModeEdit className="icon" />
                            </div>
                            <div className={`field-input ${form.name ? 'has-content' : ''}`}>
                                <input type="text" name="name" value={form.name} onChange={handleChange} autoComplete="off" tabIndex={page === 1 ? 1 : -1} />
                                <label>Name</label>
                                <MdModeEdit className="icon" />
                            </div>
                        </div>
                        <div className={`field-input ${form.email ? 'has-content' : ''}`}>
                            <input type="text" name="email" value={form.email} onChange={handleChange} autoComplete="off" tabIndex={page === 1 ? 1 : -1} />
                            <label>Enter your email</label>
                            <MdAlternateEmail className='icon' />
                        </div>
                        <div className={`field-input ${form.phone ? 'has-content' : ''}`}>
                            <input type="text" name="phone" value={form.phone} onChange={handleChange} autoComplete="off" tabIndex={page === 1 ? 1 : -1} />
                            <label>Enter your phone</label>
                            <FaPhone className="icon" />
                        </div>
                    </div>
                    <div id="logup-page-2">
                        <div
                            className={`field-input ${form.username ? 'has-content' : ''}`}
                        >
                            <input
                                type="text"
                                name="username"
                                value={form.username}
                                onChange={handleChange}
                                autoComplete="off"
                                tabIndex={page === 2 ? 1 : -1}
                            />
                            <label>Enter create username</label>
                            <FaUser className="icon" />
                        </div>
                        <div className="auth-password">
                            <div className={`field-input ${form.password ? 'has-content' : ''}`}>
                                <input type="password" name="password" value={form.password} onChange={handleChange} autoComplete="off" tabIndex={page === 2 ? 1 : -1} />
                                <label>Enter password</label>
                                <FaLock className="icon" />
                            </div>
                            <div className={`field-input ${form.re_password ? 'has-content' : ''}`}>
                                <input type="password" name="re_password" value={form.re_password} onChange={handleChange} autoComplete="off" tabIndex={page === 2 ? 1 : -1} />
                                <label>Re-enter password</label>
                                <MdOutlinePassword className='icon' />
                            </div>
                        </div>
                        <div className="auth-terms">
                            <input type="checkbox" checked={form.agree} name="agree" onChange={handleChange} tabIndex={page === 2 ? 1 : -1} />
                            <label>Agree to the terms of CodeDev</label>
                        </div>
                        <button type="submit" className="btn-logup" disabled={state.pending} tabIndex={page === 2 ? 1 : -1}>
                            {
                                state.pending ?
                                    <LoadingContent scale={0.5} color="var(--color_white)" />
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
                            <Image src="/image/static/github.ico" width={20} height={20} alt="github" />
                            <h4>Github</h4>
                        </button>
                        <button type="button">
                            <Image src="/image/static/google.ico" width={20} height={20} alt="facebook" />
                            <h4>Google</h4>
                        </button>
                        <button type="button">
                            <Image src="/image/static/facebook.ico" width={20} height={20} alt="facebook" />
                            <h4>Facebook</h4>
                        </button>
                    </div>
                    <div className="login-auth">
                        Already have an account?
                        <Link href='/auth' onClick={changeForm}>Login</Link>
                    </div>
                </div>
            </Form>
        </>
    )
}