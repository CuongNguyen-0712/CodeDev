import { useState, useRef, useEffect } from "react";

import { usePathname } from "next/navigation";

import RouterPush from "@/app/router/router";

import { FaUsers } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications } from "react-icons/io";
import { MdHome, MdEmojiEvents, MdEmail } from "react-icons/md";
import { FaCode } from "react-icons/fa6";

export default function Navbar({ handleChange, handleResize, isResize }) {

    const { navigateToCurrent, navigateToMember, navigateToComment } = RouterPush();
    const ref = useRef(null);
    const refNavigation = useRef(null);
    const currentPath = usePathname();

    const links = [
        {
            icon: <MdHome />,
            name: 'home',
            locate: 1,
        },
        {
            icon: <FaUsers />,
            name: 'member',
            locate: 2,
        },
        {
            icon: <FaCode />,
            name: 'course',
            locate: 3,
        },
        {
            icon: <MdEmojiEvents />,
            name: 'event',
            locate: 4,
        }
    ]

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

    return (
        <nav id='navbar'>
            <div className="navbar-items">
                <div className="navbar-feature">
                    <span>
                        <IoSearch />
                    </span>
                    <input type="text" placeholder="Search..." />
                </div>
                <div className="navbar-links">
                    <button>
                        <MdHome />
                        <span>Home</span>
                    </button>
                    <button>
                        <MdEmail />
                    </button>
                    <button>
                        <IoMdNotifications />
                    </button>
                    <button>
                        Feedback
                    </button>
                </div>
            </div>
        </nav>
    )
}