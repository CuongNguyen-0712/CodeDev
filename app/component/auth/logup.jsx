import { useState } from "react"

import Link from "next/link"
import Form from "next/form"
import Image from "next/image"

import { SignUpDefinition } from "@/app/lib/definition"
import SignUpService from "@/app/services/authService/signUp"
import { LoadingContent } from "../ui/loading"
import { InputGroup } from "../ui/input"

import { FaArrowRight, FaArrowLeft, FaPhone, FaGithub, FaGoogle, FaUser, FaLock } from "react-icons/fa6"
import { MdModeEdit, MdAlternateEmail, MdOutlinePassword } from "react-icons/md"
import { IoIosWarning, IoIosCheckmarkCircle } from "react-icons/io"

export default function Logup({ active, changeForm, redirect, setAlert }) {
    const [step, setStep] = useState(1)

    const [formData, setFormData] = useState({
        surname: '',
        name: '',
        email: '',
        phone: '',
        username: '',
        password: '',
        re_password: '',
        agree: false
    })

    const [validation, setValidation] = useState({})
    const [isPending, setIsPending] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (Object.keys(validation).length > 0) return

        setIsPending(true)

        const check = SignUpDefinition(formData)
        if (check.success) {
            try {
                const { re_password, agree, ...data } = formData
                const res = await SignUpService(data)

                if (res.status === 200 && res.success) {
                    setAlert({ status: res.status, message: res.message })
                    setIsPending(false)
                    setFormData({
                        surname: '', name: '', email: '', phone: '',
                        username: '', password: '', re_password: '', agree: false
                    })
                    changeForm()
                } else {
                    setIsPending(false)
                    setAlert({ status: res.status, message: res.message })
                }
            } catch (err) {
                setIsPending(false)
                setAlert({ status: 500, message: err.message })
            }
        } else {
            setValidation(check.errors)
            setIsPending(false)
        }
    }

    const handleValidation = ({ name, value = '' }) => {
        const { errors } = (name === 're_password' || name === 'password')
            ? SignUpDefinition({ ...formData, [name]: value })
            : SignUpDefinition({ [name]: value })

        setValidation((prev) => {
            const { [name]: removed, ...rest } = prev || {}
            return errors?.[name] ? { ...prev, [name]: errors[name] } : { ...rest }
        })
    }

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target
        setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
        handleValidation({ name, value: type === 'checkbox' ? checked : value })
    }

    const handleClear = (name) => {
        setFormData((prev) => ({ ...prev, [name]: '' }))
        handleValidation({ name })
    }

    const canGoNext = step < 2
    const canGoPrev = step > 1

    return (
        <Form className={`auth_form signup_form ${active ? 'active' : ''}`} onSubmit={handleSubmit}>
            <header className="form_header">
                <Image src="/image/static/logo.svg" width={48} height={48} alt="CodeDev Logo" />
                <h2>Create Account</h2>
                <p>Join <Link href="/" onClick={redirect}>CodeDev</Link> community</p>
            </header>

            <div className="step_indicator">
                <div className={`step ${step >= 1 ? 'active' : ''}`}>
                    <span className="step_number">1</span>
                    <span className="step_label">Personal Info</span>
                </div>
                <div className="step_line"></div>
                <div className={`step ${step >= 2 ? 'active' : ''}`}>
                    <span className="step_number">2</span>
                    <span className="step_label">Account Setup</span>
                </div>
            </div>

            <div className="form_body">
                <div className="form_steps" style={{ transform: `translateX(-${(step - 1) * 50}%)` }}>
                    <div className="form_step step_1">
                        <InputGroup
                            name="surname"
                            label="First Name"
                            type="text"
                            value={formData.surname}
                            onChange={handleChange}
                            error={validation?.surname}
                            icon={<MdModeEdit className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 1 ? 0 : -1}
                        />
                        <InputGroup
                            name="name"
                            label="Last Name"
                            type="text"
                            value={formData.name}
                            onChange={handleChange}
                            error={validation?.name}
                            icon={<MdModeEdit className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 1 ? 0 : -1}
                        />
                        <InputGroup
                            name="email"
                            label="Email Address"
                            type="text"
                            value={formData.email}
                            onChange={handleChange}
                            error={validation?.email}
                            icon={<MdAlternateEmail className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 1 ? 0 : -1}
                        />
                        <InputGroup
                            name="phone"
                            label="Phone Number"
                            type="text"
                            value={formData.phone}
                            onChange={handleChange}
                            error={validation?.phone}
                            icon={<FaPhone className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 1 ? 0 : -1}
                        />
                    </div>

                    <div className="form_step step_2">
                        <InputGroup
                            name="username"
                            label="Username"
                            type="text"
                            value={formData.username}
                            onChange={handleChange}
                            error={validation?.username}
                            icon={<FaUser className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 2 ? 0 : -1}
                        />
                        <InputGroup
                            name="password"
                            label="Password"
                            type="password"
                            value={formData.password}
                            onChange={handleChange}
                            error={validation?.password}
                            icon={<MdOutlinePassword className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 2 ? 0 : -1}
                            isPassword={true}
                        />
                        <InputGroup
                            name="re_password"
                            label="Confirm Password"
                            type="password"
                            value={formData.re_password}
                            onChange={handleChange}
                            error={validation?.re_password}
                            icon={<FaLock className="icon" />}
                            reset={handleClear}
                            read={isPending}
                            tabIndex={step === 2 ? 0 : -1}
                            isPassword={true}
                        />
                        <label className="terms_checkbox">
                            <input
                                type="checkbox"
                                checked={formData.agree}
                                name="agree"
                                onChange={handleChange}
                                tabIndex={step === 2 ? 0 : -1}
                            />
                            <span>I agree to the Terms & Conditions</span>
                            {validation?.agree && <IoIosWarning className="warning_icon" />}
                            {formData.agree && !validation?.agree && <IoIosCheckmarkCircle className="check_icon" />}
                        </label>
                    </div>
                </div>
            </div>

            <div className="form_actions">
                <div className="step_navigation">
                    <button
                        type="button"
                        className={`nav_btn prev ${canGoPrev ? 'active' : ''}`}
                        onClick={() => setStep((s) => s - 1)}
                        disabled={!canGoPrev}
                    >
                        <FaArrowLeft />
                    </button>
                    <button
                        type="button"
                        className={`nav_btn next ${canGoNext ? 'active' : ''}`}
                        onClick={() => setStep((s) => s + 1)}
                        disabled={!canGoNext}
                    >
                        <FaArrowRight />
                    </button>
                </div>

                {step === 2 && (
                    <button type="submit" className="btn_submit" disabled={isPending} tabIndex={step === 2 ? 0 : -1}>
                        {isPending ? (
                            <LoadingContent scale={0.5} color="var(--color_white)" />
                        ) : (
                            'Create Account'
                        )}
                    </button>
                )}
            </div>

            <footer className="form_footer">
                <div className="divider">
                    <span>or sign up with</span>
                </div>

                <div className="social_buttons">
                    <button type="button" className="social_btn">
                        <FaGithub />
                        <span>Github</span>
                    </button>
                    <button type="button" className="social_btn">
                        <FaGoogle />
                        <span>Google</span>
                    </button>
                </div>

                <p className="switch_form">
                    Already have an account?
                    <Link href="/auth" onClick={changeForm}>Sign in</Link>
                </p>
            </footer>
        </Form>
    )
}