import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { SignUpDefinition } from "@/app/lib/definition"
import SignUpService from "@/app/services/authService/signUp"
import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaArrowRight, FaArrowLeft, FaPhone } from "react-icons/fa";
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword } from "react-icons/md";
import { FaUser, FaLock } from "react-icons/fa6";
import { IoIosWarning } from "react-icons/io";

export default function Logup({
    active,
    changeForm,
    redirect,
    setAlert
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
        validation: {},
        pending: false,
    })

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (Object.keys(state.validation).length > 0) return;

        setState((prev) => ({ ...prev, pending: true }));

        const check = SignUpDefinition(form);
        if (check.success) {
            try {
                const { re_password, agree, ...data } = form
                const res = await SignUpService(data);
                if (res.status === 200 && res.success) {
                    setAlert({ status: res.status, message: res.message });
                    setState((prev) => ({ ...prev, pending: false }));
                    setForm({ surname: '', name: '', email: '', phone: '', username: '', password: '', re_password: '', agree: false });
                    changeForm();
                } else {
                    setState((prev) => ({ ...prev, pending: false }));
                    setAlert({ status: res.status, message: res.message });
                }
            } catch (err) {
                setState((prev) => ({ ...prev, pending: false }));
                setAlert({ statsu: 500, message: err.message });
            }
        }
        else {
            setState((prev) => ({ ...prev, validation: check.errors, pending: false }))
        }
    }

    const handleValidation = ({ name, value = '' }) => {
        const { errors } = (name === 're_password' || name === 'password') ?
            SignUpDefinition({ ...form, [name]: value })
            :
            SignUpDefinition({ [name]: value })

        setState((prev) => {
            const { [name]: removed, ...rest } = prev.validation || {};

            return {
                ...prev,
                validation: errors?.[name] ?
                    {
                        ...prev.validation,
                        [name]: errors[name]
                    }
                    :
                    {
                        ...rest
                    }
            }
        })
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        handleValidation({ name, value: type === 'checkbox' ? checked : value })
    }

    const handleClear = (name) => {
        setForm((prev) => ({ ...prev, [name]: '' }))
        handleValidation({ name })
    }

    return (
        <>
            <Form
                className={`logup ${active ? 'pop' : ''}`}
                onSubmit={handleSubmit}
            >
                <div className="heading-logup">
                    <Image src="/image/static/logo.svg" width={50} height={50} alt="logo" />
                    <h2>
                        Signup
                        <Link className="return_homepage" href="/" onClick={redirect}>
                            CodeDev
                        </Link>
                    </h2>
                    <span>
                        Welcome to the CodeDev
                    </span>
                </div>
                <div className="logup-page" style={{ transform: `translateX(-${(page - 1) * (100 / 2)}%)` }}>
                    <div id="logup-page-1">
                        <InputGroup
                            name="surname"
                            label="Surname"
                            type="text"
                            value={form.surname}
                            onChange={handleChange}
                            error={state.validation?.surname}
                            icon={<MdModeEdit className="icon" />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 1 ? 1 : -1}
                        />
                        <InputGroup
                            name="name"
                            label="Name"
                            type="text"
                            value={form.name}
                            onChange={handleChange}
                            error={state.validation?.name}
                            icon={<MdModeEdit className="icon" />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 1 ? 1 : -1}
                        />
                        <InputGroup
                            name="email"
                            label="Your email"
                            type="text"
                            value={form.email}
                            onChange={handleChange}
                            error={state.validation?.email}
                            icon={<MdAlternateEmail className='icon' />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 1 ? 1 : -1}
                        />
                        <InputGroup
                            name="phone"
                            label="Your phone"
                            type="text"
                            value={form.phone}
                            onChange={handleChange}
                            error={state.validation?.phone}
                            icon={<FaPhone className="icon" />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 1 ? 1 : -1}
                        />
                    </div>
                    <div id="logup-page-2">
                        <InputGroup
                            name="username"
                            label="Username"
                            type="text"
                            value={form.username}
                            onChange={handleChange}
                            error={state.validation?.username}
                            icon={<FaUser className='icon' />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 2 ? 1 : -1}
                        />
                        <InputGroup
                            name="password"
                            label="Enter password"
                            type="password"
                            value={form.password}
                            onChange={handleChange}
                            error={state.validation?.password}
                            icon={<MdOutlinePassword className="icon" />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 2 ? 1 : -1}
                            isPassword={true}
                        />
                        <InputGroup
                            name="re_password"
                            label="Re-enter password"
                            type="password"
                            value={form.re_password}
                            onChange={handleChange}
                            error={state.validation?.re_password}
                            icon={<FaLock className="icon" />}
                            reset={(name) => handleClear(name)}
                            read={state.pending}
                            tabIndex={page === 2 ? 1 : -1}
                            isPassword={true}
                        />
                        <div className="auth-terms">
                            <input type="checkbox" checked={form.agree} name="agree" onChange={handleChange} tabIndex={page === 2 ? 1 : -1} />
                            <label>Agree to the terms of CodeDev</label>
                            {
                                state.validation?.agree &&
                                <IoIosWarning fontSize={17} color="var(--color_orange)" />
                            }
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