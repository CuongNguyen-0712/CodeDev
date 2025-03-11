import { IoClose } from "react-icons/io5";

import { useQuery, useRouterActions } from "@/app/router/router";

export default function Manage() {
    const { navigateToAuth } = useRouterActions();
    const queryNavigate = useQuery();

    return (
        <form id="managePanel">
            <div className="info-manage">

                <div className="heading-manage">

                </div>
                <div className="beside-manage">

                </div>
            </div>
            <div>

            </div>
            <div className="footer-manage">
                <button type="button">
                    Change account
                </button>
                <button type="button" onClick={navigateToAuth}>
                    Logout
                </button>
            </div>
            <button type="button" id="cancel-manage" onClick={() => queryNavigate(window.location.pathname, { manage: false })}>
                <IoClose />
            </button>
        </form>
    )
}