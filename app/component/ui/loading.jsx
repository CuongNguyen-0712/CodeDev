import { TfiReload } from "react-icons/tfi";

export function LoadingRedirect() {
    return (
        <div id="loadRedirect">
            <div className="shape">
                <div className='square'></div>
                <div className="circle"></div>
            </div>
            <h3>CodeDev</h3>
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