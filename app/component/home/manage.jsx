import { IoClose } from "react-icons/io5";
import { useState, useEffect } from "react";
import GetInfoService from "@/app/services/getService/infoService";
import { LoadingContent } from "../ui/loading";

import { useQuery, useRouterActions } from "@/app/router/router";
import { usePathname } from "next/navigation";

import Image from "next/image";
import Logo from "@/public/image/logo.svg";
import Default from "@/public/image/default.svg";

export default function Manage({ redirect }) {
    const [state, setState] = useState({
        data: [],
        update: [],
        error: null,
        pending: true,
    })

    const { navigateToAuth } = useRouterActions();
    const queryNavigate = useQuery();
    const pathname = usePathname();

    const handleLogout = (e) => {
        e.preventDefault();
        redirect();
        navigateToAuth();
    }

    const fetchData = async () => {
        try {
            const res = await GetInfoService('CD01');;
            if (res.status == 200) {
                setState((prev) => ({ ...prev, data: res.data, pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message || 'Something is error' }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }))
            throw new Error(err)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    return (
        <form id="managePanel">
            <div className="heading-manage">
                <Image src={Logo} alt='logo' width={25} height={25} />
                <h2>Quick Manage</h2>
            </div>
            {
                state.pending ?
                    <LoadingContent />
                    :
                    (state.error && state.data.length > 0) ?
                        <p>Error {state.error.status}: {state.error.message}</p>
                        :
                        <>
                            <div className="content-manage">
                                {
                                    (pathname !== '/home') &&
                                    <div className="quick-handle">

                                    </div>
                                }
                                <div className="info-manage">
                                    <div className="beside">
                                        <div id="myAvatar">
                                            <Image src={Default || a} alt='avatar' width={100} height={100} />
                                        </div>
                                        <div className="image-btns">
                                            <button type="button" id="import-image">
                                                Import
                                            </button>
                                            <button type="button" id="save-image">
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                    <div className="info">
                                        <div className="info-container">
                                            <h3>CuongNguyen</h3>
                                            <div className="item">
                                                <label>Nickname:</label>
                                                <input type="text" />
                                            </div>
                                            <div className="item">
                                                <label>Surname</label>
                                                <input type="text" name="surname" readOnly />
                                            </div>
                                            <div className="item">
                                                <label>Name</label>
                                                <input type="text" />
                                            </div>
                                            <div className="item">
                                                <label></label>
                                                <input type="text" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </>
            }
            <div className="footer-manage">
                <button type="button" id="change-account">
                    Change account
                </button>
                <button type="button" id="logout" onClick={handleLogout}>
                    Logout
                </button>
            </div>
            <button type="button" id="cancel-manage" onClick={() => queryNavigate(window.location.pathname, { manage: false })}>
                <IoClose />
            </button>
        </form >
    )
}