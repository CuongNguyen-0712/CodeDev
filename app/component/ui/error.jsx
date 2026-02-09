import Image from "next/image"
import { useRouterActions } from "@/app/router/router"

import { BiSolidMessageAltError } from "react-icons/bi";
import { IoReload, IoClose } from "react-icons/io5";

export function ErrorReload({ data = null, refetch, callback = null }) {
    if (data === null) return;

    const { status, message } = data
    return (
        <div id="error">
            <div className="error_layout">
                <div className="heading_round">
                    <BiSolidMessageAltError fontSize={20} />
                </div>
                <div className="error_content">
                    <p>
                        {message}
                        <br />
                        (code: {status})
                    </p>
                    <div className="handle_error_btns">
                        <button
                            onClick={refetch}
                            id="reload_btn"
                        >
                            <IoReload />
                        </button>
                        {
                            callback &&
                            <button
                                onClick={callback}
                                id="demiss_btn"
                            >
                                <IoClose />
                            </button>
                        }
                    </div>
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

