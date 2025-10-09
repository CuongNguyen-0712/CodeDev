export function LoadingRedirect({ scale }) {
    return (
        <div id="loadRedirect" style={scale && { scale: scale }}>
            <svg className="logo_svg" viewBox="-5 -5 110 95">
                <polygon
                    className="triangle"
                    points="50,0 0,85 100,85" />
            </svg>
        </div>
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