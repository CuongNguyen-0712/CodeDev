import { useState } from "react"

import CreateUser from "../handleUser/createUser";

import { BiSolidUserCircle } from 'react-icons/bi';
import { MdEmail } from "react-icons/md";
import { PiLockKeyFill } from "react-icons/pi";

export default function Register({ change }) {

    const [form, setForm] = useState({
        name: '',
        pass: '',
        email: '',
        access_level: "user",
    });

    const handleCreateUser = async (e) => { 
        e.preventDefault();

        try{
            await new Promise(resolve => setTimeout(resolve, 1000));
            if(CreateUser(form.name, form.pass, form.email, form.access_level)){
                change();
            }
        }
        catch(err){
            console.log(err)
        }
    }

    return (
        <>
            <div className='register-form' onSubmit={handleCreateUser}>
                <form className="form-input">
                    <article className="input-group">
                        <span className="title">Sign Up</span>
                        <div id="optionLogin">
                            <img src="/image/apple.ico" alt="options" />
                            <img src="/image/google.ico" alt="options" />
                            <img src="/image/facebook.ico" alt="options" />
                            <img src="/image/github.ico" alt="options" />
                            <img src="/image/twitter.ico" alt="options" />
                        </div>
                        <div className="email-form">
                            <span className="icon"><MdEmail /></span>
                            <input type="text"
                                name="email"
                                required
                                autoComplete="current-value"
                                autoFocus
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                                placeholder="Email"
                            />
                        </div>
                        <div className="user-form">
                            <span className="icon"><BiSolidUserCircle /></span>
                            <input type="text"
                                name="username"
                                required
                                autoComplete="current-value"
                                autoFocus
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                                placeholder="Username"
                            />
                        </div>

                        <div className="pass-form">
                            <span className="icon"><PiLockKeyFill /></span>
                            <input type="password"
                                name="password"
                                value={form.pass}
                                required
                                autoComplete="current-value"
                                onChange={(e) => setForm({ ...form, pass: e.target.value })}
                                placeholder="Password"
                            />
                        </div>
                    </article>
                    <button type="submit" className={`btn-register ${form.handleSubmit ? 'active' : ''}`}>
                        <h2>Register</h2>
                    </button>
                </form>
                <footer className="footer-login">
                    <span>Log in here !</span>
                    <button className="login-handle" onClick={change}>
                        Sign In
                    </button>
                </footer>
            </div>
        </>
    )
}