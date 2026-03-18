'use client'
import { useState, useEffect } from "react"

export function LoadingRedirect({ scale }) {

    const [message, setMessage] = useState(null);
    const [onChange, setOnChange] = useState(true);

    const message_timer = (message, delay) => {
        const timer = setTimeout(() => {
            setMessage(message)
        }, delay)

        return () => clearTimeout(timer)
    }

    useEffect(() => {
        message_timer("Redirecting...", 5000)
        message_timer("Still redirecting...", 10000)
        message_timer("Waiting...", 15000)
    }, [])

    useEffect(() => {
        setOnChange(true)

        const timer = setTimeout(() => {
            setOnChange(false)
        }, 200)

        return () => clearTimeout(timer)
    }, [message])

    return (
        <div id='loadRedirect'>
            <div id="redrect_loader" style={scale && { scale: scale }}>
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
        </div>
    )
}

export function LoadingContent({ scale = 1, color = 'var(--color_primary)', message = null }) {
    return (
        <div className="loading-container">
            <div className="loading-spinner" style={{ transform: `scale(${scale})` }}>
                <svg viewBox="0 0 50 50">
                    <circle cx="25" cy="25" r="20" fill="none" strokeWidth="4" style={{ stroke: color }} />
                </svg>
            </div>
            {message && <p className="loading-message">{message}</p>}
        </div>
    )
}