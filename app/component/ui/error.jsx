import Image from "next/image"
import Logo from "@/public/image/logo.svg"
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
    const { navigateToHome, navigateBack } = useRouterActions();

    return (
        <div id="page_error">
            <div className="content_error">
                <Image src={Logo} alt='Logo' width={100} height={100} />
                <h1>Page not found</h1>
                <footer>
                    <button onClick={() => navigateToHome()}>
                        Go home
                    </button>
                    <button onClick={() => navigateBack()}>
                        Go back
                    </button>
                </footer>
            </div>
        </div>
    )
}

