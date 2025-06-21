import { TfiReload } from "react-icons/tfi";

export function LoadingRedirect() {
    return (
        <div id="loadRedirect">
            <svg className="logo_svg" viewBox="-5 -5 110 95">
                <polygon
                    className="triangle"
                    points="50,0 0,85 100,85" />
            </svg>
        </div>
    )
}

export function LoadingContent() {
    return (
        <div id="loadContent">
            <TfiReload />
        </div>
    )
}