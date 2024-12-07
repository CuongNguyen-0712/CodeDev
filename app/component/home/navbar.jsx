import { useRef, useEffect } from "react";

import RouterPush from "@/app/router/router";

import { FaListUl } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications, IoMdAdd } from "react-icons/io";
import { MdEmail, MdWindow } from "react-icons/md";

export default function Navbar({ onWidthDevice, handleResize, onMobile }) {

    const { navigateToCurrent, navigateToMember, navigateToComment } = RouterPush();
    const ref = useRef(null);
    const refNavigation = useRef(null);

    const handleClickOutSide = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
            setFocus(false);
        }
        if (refNavigation.current && !refNavigation.current.contains(e.target)) {
            setOption(false);
        }
    }

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutSide);

        return () => {
            document.removeEventListener("mousedown", handleClickOutSide);
        }
    }, [])

    const handleRoutePush = (key) => {
        setOption(true);
        switch (key) {
            case 1:
                handleChange();
                navigateToCurrent();
                break;
            case 2:
                handleChange();
                navigateToMember();
                break;
            case 3:
                handleChange();
                navigateToComment();
                break;
            default:
                return;
        }
    }

    console.log(onMobile)

    return (
        <nav id='navbar'>
            <div className="navbar-items">
                <div className="navbar-feature" style={{ width: onWidthDevice && "50%" }}>
                    {onWidthDevice &&
                        <button className="menu-btn" onClick={handleResize}>
                            <FaListUl />
                        </button>
                    }
                    <div className="input-container">
                        <span>
                            <IoSearch />
                        </span>
                        {!onWidthDevice &&
                            <input type="text" placeholder="Search..." />
                        }
                    </div>
                </div>
                <div className="navbar-links">
                    <button>
                        <IoMdAdd />
                        <span>Add</span>
                    </button>
                    {onMobile ?
                        <>
                            <button style={{background: "var(--color_black)", color: "#fff"}}>
                                <MdWindow />
                            </button>
                            <ul className="group-links">

                            </ul>
                        </>
                        :
                        <>
                            <button>
                                <MdEmail />
                            </button>
                            <button>
                                <IoMdNotifications />
                            </button>
                            <button>
                                Feedback
                            </button>
                        </>
                    }
                </div>
            </div>
        </nav>
    )
}