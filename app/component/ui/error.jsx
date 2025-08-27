import Image from "next/image"
import { useRouterActions } from "@/app/router/router"

export function ErrorReload({ data, refetch }) {
    const { status, message } = data
    return (
        <div id="error">
            <p>Error {status}: {message}</p>
            <button onClick={refetch}>Reload</button>
        </div>
    )
}

export function PageError() {
    const { navigateBack } = useRouterActions();

    return (
        <div id="page_error">
            <div className="content_error">
                <Image src={'/image/static/logo.svg'} alt='Logo' width={80} height={80} />
                <h2>Page not found</h2>
                <footer>
                    <button onClick={() => navigateBack()}>
                        Go back
                    </button>
                </footer>
            </div>
        </div>
    )
}

