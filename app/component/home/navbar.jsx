import { useState, useRef, useEffect } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";

import RouterPush from "@/app/router/router";

import { FaList, FaUsers } from "react-icons/fa";
import { IoSearchSharp } from "react-icons/io5";
import { MdHome, MdAccountBox, MdEmojiEvents } from "react-icons/md";
import { FaCode } from "react-icons/fa6";

export default function Navbar({handleChange, handleResize, isResize}) {

    const { navigateToHome, navigateToMember, navigateToComment } = RouterPush();
    const ref = useRef(null);
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
        if(ref.current && !ref.current.contains(e.target)){
            setFocus(false);
        }
    }

    useEffect(() => {
        document.addEventListener("mousedown", handleClickOutSide);

        return () => {
            document.removeEventListener("mousedown", handleClickOutSide);
        }
    }, [])

    const [isResizeSearch, setResizeSearch] = useState(false);
    const [isFocus, setFocus] = useState(false);
    const [isOption, setOption] = useState(false);

    const handleRoutePush = (key) => {
        setOption(true);
        switch (key) {
            case 1:
                handleChange();
                navigateToHome();
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
                <button className={`home_btn ${!isResize ? 'resize' : ''}`} onClick={() => handleResize()} disabled={currentPath !== '/'}>
                    <MdHome />
                </button>
                <div className={`navbar-search ${isResizeSearch ? 'resize' : ''}`}>
                    <button onClick={() => setResizeSearch(!isResizeSearch)} className={`search-btn ${isResizeSearch ? '' : 'change'}`}>
                        <IoSearchSharp />
                    </button>
                    <input type="text" placeholder="Search anything" name="search_value" id="search_value" onFocus={() => setFocus(true)}/>
                    <ul className={`search-list ${isFocus ? 'focus' : ''}`} ref={ref}>
                        <li>
                            <h2>Member</h2>
                            <span>Make friend and join our team</span>
                        </li>
                        <li>
                            <h2>Course</h2>
                            <span>Dicover our courses</span>
                        </li>
                        <li>
                            <h2>Event</h2>
                            <span>Check and join our event</span>
                        </li>
                    </ul>
                </div>
                <div className="navbar-links">
                    <button onClick={() => setOption(!isOption)} className={`${isOption ? 'links' : ''}`}>
                        <FaList />
                    </button>
                    {isOption &&
                        <div className="link-option">
                            {links.filter(link => `/${link.name}` !== currentPath).map((link, index) => (
                                <button key={index} onClick={() => handleRoutePush(link.locate)}>
                                    <span>{link.icon}</span>
                                    <span>{link.name}</span>
                                </button>
                            ))}
                        </div>
                    }
                    <button>
                        < MdAccountBox />
                    </button>
                </div>
            </div>
            <div id="account">

            </div>
        </nav>
    )
}