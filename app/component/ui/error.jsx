import Image from "next/image"
import { useRouterActions } from "@/app/router/router"

export function ErrorReload({ data, refetch, callback = null }) {
    const { status, message } = data
    return (
        <div id="error">
            <div className="error_layout">
                <h5>
                    Error {status}
                </h5>
                <p>
                    {message}
                </p>
                <div className="handle_error_btns">
                    <button
                        onClick={refetch}
                        id="reload_btn"
                    >
                        Reload
                    </button>
                    {
                        callback &&
                        <button
                            onClick={callback}
                            id="demiss_btn"
                        >
                            Demiss
                        </button>
                    }
                </div>
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

