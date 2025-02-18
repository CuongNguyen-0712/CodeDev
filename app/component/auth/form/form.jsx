import { useState, useEffect } from "react"

import Login from "./login"
import Logup from "./logup"

export default function Form({isHandle}) {
    const [form, setForm] = useState({ login: true, register: false })
    
    const [sizeDevice, setSizeDevice] = useState({height: 0, width: 0});

    
    useEffect(() => {
        const handleSetDeviceLayout = () => {
            const heightDevice = window.innerHeight
            const widthDevice = window.innerWidth
            setSizeDevice({
                height: heightDevice,
                width: widthDevice
            })
        }

        handleSetDeviceLayout();

        window.addEventListener('resize', handleSetDeviceLayout)
        
        return () => {
            window.removeEventListener('resize', handleSetDeviceLayout)
        }
    }, [])

    return (
        <section className="auth-form">
            <div className="form">
                <div className="heading-form" style={{display: sizeDevice.height <= 550 ? 'none' : 'flex'}}>
                    <button
                        className={`${form.login ? 'active' : ''}`}
                        onClick={() => setForm({ login: true, register: false })}>
                        Login
                    </button>
                    <button
                        className={`${form.register ? 'active' : ''}`}
                        onClick={() => setForm({ login: false, register: true })}>
                        Register
                    </button>
                    <span className="focus" style={{ transform: form.login && 'translateX(10px)' || form.register && 'translateX(calc(100% + 30px))' }}></span>
                </div>
                <div className="main-form">
                    <Login active={form.login} setForm={() => setForm({ login: false, register: true })} handleAuthLogin = {isHandle}/>
                    <Logup active={form.register} setForm={() => setForm({ login: true, register: false })} handleAuthLogup = {isHandle}/>
                </div>
            </div>
        </section>
    )
}        