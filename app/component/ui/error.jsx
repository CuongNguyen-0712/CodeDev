import Image from "next/image"
import { useRouterActions } from "@/app/router/router"

export function ErrorReload({ data, refetch }) {
    const { status, message } = data
    return (
        <div id="error">
            <div className="error_layout">
                <h4>
                    Error {status}
                </h4>
                <p>
                    {message}
                </p>
                <button onClick={refetch}>Reload</button>
            </div>
        </div>
    )
}

export function PageError() {
    const { navigateBack } = useRouterActions();

    return (
        <div id="page_broken">
            <div className="content_broken">
                <Image src={'/image/static/broken_link.png'} alt='broken_link' width={100} height={100} />
                <p>The page you are looking for was broken or does not exist. Try again later.</p>
                <button id="back_btn" onClick={() => navigateBack()}>
                    Go back
                </button>
            </div>
        </div>
    )
}

