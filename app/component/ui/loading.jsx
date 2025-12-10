'use client'
import { useState, useEffect } from "react"

export function LoadingRedirect({ scale }) {

    const [message, setMessage] = useState(null);
    const [onChange, setOnChange] = useState(false);

    const message_timer = (message, delay) => {
        const timer = setTimeout(() => {
            setMessage(message)
        }, delay)

        return () => clearTimeout(timer)
    }

    useEffect(() => {
        message_timer("Redirecting...", 10000)
        message_timer("Still redirecting...", 20000)
        message_timer("Waiting...", 30000)
    }, [])

    useEffect(() => {
        setOnChange(true)

        setTimeout(() => {
            setOnChange(false)
        }, 200)
    }, [message])

    return (
        <>
            <div id="loadRedirect" style={scale && { scale: scale }}>
                <svg className="logo_svg" viewBox="-5 -5 110 95">
                    <polygon
                        className="triangle"
                        points="50,0 0,85 100,85" />
                </svg>
            </div>
            <div
                id="redirect_message"
            >
                <p
                    style={
                        onChange ?
                            {
                                transform: 'translateY(30px)',
                                opacity: 0,
                                transition: '0.2s all ease'
                            }
                            :
                            {
                                transform: 'translateY(0px)',
                                opacity: 1,
                                transition: '0.2s all ease'
                            }
                    }
                >
                    {message ?? ''}
                </p>
            </div>
        </>
    )
}

export function LoadingContent({ scale, color = 'var(--color_black)', message = null }) {
    return (
        <div id="loadContent">
            <svg className="loader" viewBox="0 0 50 50" style={scale && { scale: scale }}>
                <circle className="path" cx="25" cy="25" r="20" fill="none" strokeWidth="5" style={{ stroke: color }} />
            </svg>
            {
                message &&
                <p>{message}</p>
            }
        </div>
    )
}