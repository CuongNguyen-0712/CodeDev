import { useState, useEffect } from "react"
import { usePathname } from "next/navigation";
import handleCheckKeyDown from "@/app/function/handleCheckKeyDown";

import { BiSolidUserCircle } from 'react-icons/bi';
import { FaTruckArrowRight } from "react-icons/fa6";
import { PiLockKeyFill } from "react-icons/pi";
export default function Login({ login }) {
    const isCapsLock = handleCheckKeyDown('CapsLock');
    const pathName = usePathname();
    const [form, setForm] = useState({
        name: '',
        pass: '',
        handleSubmit: false
    });
    useEffect(() => {
        if (pathName === '/') {
            setTimeout(() => {
                setForm((state) => ({
                    ...state,
                    handleSubmit: false
                }))
            }, 1000);
        }
    }, [form.handleSubmit])

    const handleSubmit = async (e) => {
        e.preventDefault();
        setForm((state) => ({
            ...state,
            handleSubmit: true
        }))
        login({ name: form.name, pass: form.pass });
    };

    return (
        <>
            <div className='login-form'>
                <span className="title">Sign In</span>
                <form className="form-input" onSubmit={handleSubmit}>
                    <article className="input-group">
                        <div id="optionLogin">
                            <img src="/img/apple.ico" alt="options" />
                            <img src="/img/google.ico" alt="options" />
                            <img src="/img/facebook.ico" alt="options" />
                            <img src="/img/github.ico" alt="options" />
                            <img src="/img/twitter.ico" alt="options" />
                        </div>
                        <div className="user-form">
                            <span className="userIcon"><BiSolidUserCircle /></span>
                            <input type="text"
                                id="username"
                                name="username"
                                required
                                autoComplete="current-value"
                                autoFocus
                                minLength={4}
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Username"
                            />
                        </div>

                        <div className="pass-form">
                            <span className="passIcon"><PiLockKeyFill /></span>
                            <input type="password"
                                id="password"
                                name="password"
                                value={form.pass}
                                required
                                autoComplete="current-value"
                                minLength={4}
                                onChange={(e) => setForm({ ...form, pass: e.target.value })}
                                placeholder="Password"
                            />
                        </div>

                        <span id="capslock">{isCapsLock ? 'Capslock is on' : ''}</span>

                    </article>
                    <button type="submit" className={`btn-login ${form.handleSubmit ? 'active' : ''}`}>
                        <span className="loginIcon" ><FaTruckArrowRight /></span>
                        <h2>LOGIN</h2>
                    </button>
                </form>
            </div>
        </>
    )
}