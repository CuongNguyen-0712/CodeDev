'use client'
import { useState, cloneElement } from "react"

import Navbar from "../home/navbar"

import { LoadingRedirect } from "../ui/loading"

export default function Layout({ children }) {

    const [state, setState] = useState({
        redirect: false,
    })

    return (
        <main id="home">
            {state.redirect ?
                <LoadingRedirect />
                :
                <>
                    <div id="header">
                        <Navbar
                            handleRedirect={() => setState(prev => ({ ...prev, redirect: true }))}
                        />
                    </div>
                    <div id="container">
                        {cloneElement(children, { redirect: () => setState(prev => ({ ...prev, redirect: true })) })}
                    </div>
                </>
            }
        </main >
    )
}