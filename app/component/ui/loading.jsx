import { TfiReload } from "react-icons/tfi";

export function LoadingRedirect() {
    return (
        <div id="loadRedirect">
            <div className="shape">
                <div className='square'></div>
                <div className="circle"></div>
            </div>
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