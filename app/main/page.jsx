'use client'

import HomePage from "../component/home/home"
import { AuthProvider } from "../component/auth/handleAuth/authContext"
export default function Home(){

    return (
        <AuthProvider>
            <HomePage />
        </AuthProvider>
    )
}