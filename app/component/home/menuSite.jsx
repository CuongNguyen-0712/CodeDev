import { useState, useEffect, useRef } from "react";

import Image from "next/image";

import RouterPush from "@/app/router/router";

import { FiMoon, FiSun } from "react-icons/fi";
import { FaUsers, FaLaptopCode, FaSignOutAlt, FaAngleLeft, FaSyncAlt } from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from 'react-icons/fa6';
import { IoSettingsSharp } from "react-icons/io5";
import { MdHelpCenter, MdUnfoldMore, MdSpaceDashboard, MdManageAccounts, MdEmojiEvents } from "react-icons/md";
import { AiFillProject } from "react-icons/ai";

export default function MenuSite({ handleSetContent, sizeDevice, handleRedirect }) {

    const { navigateToCourse, navigateToEvent, navigateToMember, navigateToAuth } = RouterPush();
    const refNavigation = useRef(null);

    const [layoutHeight, setLayoutHeight] = useState(false);

    const [targetItem, setTargetItem] = useState(0);
    const [targetBtn, setTargetBtn] = useState(2);
    const [showMore, setShowMore] = useState(false);
    const [showOther, setShowOther] = useState(false);

    const handleNavigation = (index, handle, navigate) => {
        refNavigation.current.style.top = `${index * 49}px`;
        setTargetItem(index);
        if (typeof handle === 'function' && typeof navigate === 'undefined') {
            handle(index);
        }
        else if (typeof navigate === 'function' && typeof handle === 'undefined') {
            navigate();
            handleRedirect();
        }
    }

    useEffect(() => {
        if (sizeDevice.height < 600) {
            setLayoutHeight(true);
        }
        else {
            setLayoutHeight(false);
        }
    }, [sizeDevice])

    const menuList = [
        {
            tagClass: "dashboard-frame",
            name: "Dashboard",
            icon: <MdSpaceDashboard />,
            handle: handleSetContent,
            index: 0
        },
        {
            tagClass: "course-frame",
            name: "Course",
            icon: <FaCode />,
            links: [
                {
                    name: "My course",
                    handle: handleSetContent,
                    index: 1,
                },
                {
                    name: "All course",
                    navigate: navigateToCourse
                }
            ]
        },
        {
            tagClass: "roadmap-frame",
            name: "Roadmap",
            icon: <GoProjectRoadmap />,
            handle: handleSetContent,
            index: 2
        },
        {
            tagClass: "project-frame",
            name: "Project",
            icon: <AiFillProject />,
            links: [
                {
                    name: "My project",
                    handle: handleSetContent,
                    index: 0
                },
                {
                    name: "Teams project",
                    handle: handleSetContent,
                    index: 0
                }
            ]
        },
        {
            tagClass: "member-frame",
            name: "Member",
            icon: <FaUsers />,
            links: [
                {
                    name: "Teams",
                    handle: handleSetContent,
                    index: 0
                },
                {
                    name: "Friends",
                    handle: handleSetContent,
                    index: 0
                },
                {
                    name: "Social",
                    navigate: navigateToMember
                }
            ]
        },
        {
            tagClass: "event-frame",
            name: "Event",
            icon: <MdEmojiEvents />,
            navigate: navigateToEvent
        }
    ]

    const buttonList = [
        {
            icon: <FiMoon />
        },
        {
            icon: <FaLaptopCode />
        },
        {
            icon: <FiSun />
        }
    ]

    return (
        <div className='menu-site'>
            <header className='header-menu'>
                <div className="heading" onClick={() => { !layoutHeight && setShowMore(!showMore) }}>
                    {!layoutHeight &&
                        <Image src={"/"} width={60} height={60} alt="avatar" />
                    }
                    <div className="account-info">
                        <h3>CuongNguyen</h3>
                        <div className="info">
                            <div className="role">
                                <h4>Role</h4>
                                <span>User</span>
                            </div>
                            {
                                !layoutHeight &&
                                <div className="address">
                                    <h4>Address</h4>
                                    <span>Ha Noi, Viet Nam</span>
                                </div>
                            }
                        </div>
                    </div>
                    {
                        layoutHeight &&
                        <>
                            <button style={{ background: 'var(--color_black)' }}>
                                <MdManageAccounts />
                            </button>
                            <button
                                style={{ background: 'var(--color_red)' }}
                                onClick={() => {
                                    navigateToAuth();
                                    handleRedirect();
                                }}
                            >
                                <FaSignOutAlt />
                            </button>
                        </>
                    }
                    {!layoutHeight && <MdUnfoldMore />}
                </div>
                {(showMore || layoutHeight) &&
                    <div className="account-btn" style={{ flexGrow: layoutHeight && "1", flexDirection: layoutHeight && 'row' }}>
                        {
                            !layoutHeight &&
                            <>
                                <button style={{ background: 'var(--color_black)' }}>
                                    <MdManageAccounts />
                                    Manage
                                </button>
                                <button
                                    style={{ background: 'var(--color_red)' }}
                                    onClick={() => {
                                        navigateToAuth();
                                        handleRedirect();
                                    }}
                                >
                                    <FaSignOutAlt />
                                    Sign out
                                </button>

                            </>
                        }
                        <button style={{ background: 'var(--color_blue)' }}>
                            <FaSyncAlt />
                            Switch account
                        </button>
                    </div>
                }
            </header>
            <div className="main-menu">
                <h3>Main menu</h3>
                <div className="menu-frame">
                    <div className="menu">
                        {menuList.map((item, index) => (
                            <div className={item.tagClass} key={index}>
                                <button
                                    className={`${targetItem === index ? 'active' : ''}`}
                                    onClick={() => handleNavigation(index, item.handle, item.navigate)}
                                >
                                    {item.icon}
                                    <span>{item.name}</span>
                                </button>
                                {(item.links && index === targetItem) &&
                                    <ul className="list">
                                        {item.links.map((link, index) => (
                                            <li key={index}
                                                onClick={() => handleNavigation(link.index, link.handle, link.navigate)}
                                            >
                                                {link.name}
                                            </li>
                                        ))}
                                    </ul>
                                }
                            </div>
                        ))}
                        <span className="navigation" ref={refNavigation}></span>
                    </div>
                </div>
            </div>
            <footer className='footer-menu'>
                <div className="other-section">
                    <h3 onClick={() => setShowOther(!showOther)}>
                        Other
                        <FaAngleLeft style={showOther ? { transform: 'rotate(-90deg)' } : { transform: 'rotate(0deg)' }} />
                    </h3>
                    {showOther &&
                        <div className="other-frame">
                            <button style={{ color: 'var(--color_white)', background: 'var(--color_black)' }}>
                                <IoSettingsSharp />
                                Settings
                            </button>
                            <button style={{ background: 'var(--color_gray)', color: 'var(--color_black)' }}>
                                <MdHelpCenter />
                                Help Center
                            </button>
                        </div>
                    }
                </div>
                <div className="mode-frame">
                    {buttonList.map((item, index) => (
                        <button key={index}
                            className={targetBtn === index ? 'active' : ''}
                            onClick={() => setTargetBtn(index)}>
                            {item.icon}
                        </button>
                    ))}
                </div>
            </footer>
        </div>
    )
}