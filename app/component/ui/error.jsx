import Image from "next/image"
import { useRouterActions } from "@/app/router/router"

import { BiSolidMessageAltError } from "react-icons/bi";
import { IoReload, IoClose } from "react-icons/io5";
import { HiExclamationTriangle } from "react-icons/hi2";

export function ErrorReload({ data = null, refetch, callback = null }) {
    if (data === null) return null;

    const { status, message } = data;

    return (
        <div className="error-container">
            <div className="error-content">
                <div className="error-icon">
                    <HiExclamationTriangle />
                </div>
                <div className="error-text">
                    <h4>Something went wrong</h4>
                    <p>{message || "An unexpected error occurred"}</p>
                    <span className="error-code">Error code: {status || 500}</span>
                </div>
                <div className="error-actions">
                    <button className="btn-reload" onClick={refetch}>
                        <IoReload />
                        <span>Retry</span>
                    </button>
                    {callback && (
                        <button className="btn-dismiss" onClick={callback}>
                            <IoClose />
                        </button>
                    )}
                </div>
            </div>
        </div>
    )
}

export function PageError() {
    const { navigateBack } = useRouterActions();

    return (
        <div className="page-error">
            <div className="error-content">
                <div className="error-illustration">
                    <Image
                        src="/image/static/broken_link.png"
                        alt="Broken link illustration"
                        width={120}
                        height={120}
                        priority
                    />
                </div>
                <div className="error-text">
                    <h2>Something went wrong</h2>
                    <p>The page you're looking for is broken or doesn't exist. Please try again later.</p>
                </div>
                <button className="btn-back" onClick={() => navigateBack()}>
                    Go back
                </button>
            </div>
        </div>
    );
}

