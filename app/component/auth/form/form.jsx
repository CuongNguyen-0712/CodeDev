import { useState } from "react"

import Login from "./login/login"
import Register from "./register/register"
import Intro_login from "./login/intro_login"
import Intro_register from "./register/intro_register"

import { useAuth } from "../handleAuth/authContext"

export default function Form() {

    const { loginWithCredentials } = useAuth();
    const [change, setChange] = useState(true);

    const handleLogin = ({ name, pass }) => {
        loginWithCredentials({ name, pass });
    }

    return (
        <main id='mainsheet'>
            <div className={`form ${change ? 'effect1' : 'effect2'}`}>
                <div className="form_layout">
                    <Login login={handleLogin} />
                    <Register />
                </div>
                <div className="intro_layout">
                    <Intro_login change={() => setChange(!change)} />
                    <Intro_register change={() => setChange(!change)} />
                </div>
            </div>
        </main>
    )
}