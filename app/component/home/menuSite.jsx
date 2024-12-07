import { useState, useEffect, useRef } from "react";

import Image from "next/image";

import RouterPush from "@/app/router/router";

import { FiMoon, FiSun } from "react-icons/fi";
import { FaUsers, FaLaptopCode, FaSignOutAlt, FaAngleLeft } from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from 'react-icons/fa6';
import { IoSettingsSharp } from "react-icons/io5";
import { MdHelpCenter, MdUnfoldMore, MdSpaceDashboard, MdManageAccounts, MdEmojiEvents } from "react-icons/md";
import { AiFillProject } from "react-icons/ai";

export default function MenuSite({ handleSetContent, onHeightDevice }) {

    const { navigateToMember, navigateToCourse, navigateToEvent } = RouterPush();
    const refNavigation = useRef(null);

    const [targetItem, setTargetItem] = useState(0);
    const [targetBtn, setTargetBtn] = useState(2);
    const [showMore, setShowMore] = useState(false);
    const [showOther, setShowOther] = useState(false);

    const handleNavigation = (index, handle) => {
        refNavigation.current.style.top = `${index * 49}px`;
        setTargetItem(index);
        if (typeof handle === 'function') {
            handle();
        }
    }

    useEffect(() => {
        if(onHeightDevice){
            setShowMore(true);
        }
    }, [onHeightDevice])

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
                    handle: navigateToCourse
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
                    handle: navigateToMember
                }
            ]
        },
        {
            tagClass: "event-frame",
            name: "Event",
            icon: <MdEmojiEvents />,
            handle: navigateToEvent
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
            <header className='header-menu' style={{ flexDirection: onHeightDevice && "row" }}>
                <div className="heading" onClick={() => { !onHeightDevice && setShowMore(!showMore) }} style = {{pointerEvents: onHeightDevice && "none"}}>
                    {!onHeightDevice &&
                        <Image src={"/"} width={60} height={60} alt="avatar" />
                    }
                    <div className="account-info">
                        <h3>CuongNguyen</h3>
                        <div className="info">
                            <div className="role">
                                <h4>Role</h4>
                                <span>Admin</span>
                            </div>
                            <div className="address">
                                <h4>Address</h4>
                                <span>Ha Noi, Viet Nam</span>
                            </div>
                        </div>
                    </div>
                    {!onHeightDevice && <MdUnfoldMore />}
                </div>
                {showMore &&
                    <div className="account-btn" style={{ width: onHeightDevice && "100px" }}>
                        <button style={{ width: onHeightDevice && "max-content", padding: onHeightDevice && "10px", height: '100%' }}>
                            <MdManageAccounts />
                            {!onHeightDevice &&
                                <span>Manage account</span>
                            }
                        </button>
                        <button style={{ width: onHeightDevice && "max-content", padding: onHeightDevice && "10px", height: '100%' }}>
                            <FaSignOutAlt />
                            {!onHeightDevice &&
                                <span>Sign out</span>
                            }
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
                                <button className={`${targetItem === index ? 'active' : ''}`} onClick={() => handleNavigation(index, item.handle?.bind(null, item.index))}>
                                    {item.icon}
                                    <span>{item.name}</span>
                                </button>
                                {(item.links && index === targetItem) &&
                                    <ul className="list">
                                        {item.links.map((link, index) => (
                                            <li key={index} onClick={() => link.handle?.bind(null, link.index)()}>{link.name}</li>
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
                            <button className="other-feature">
                                <IoSettingsSharp />
                                <span>
                                    Settings
                                </span>
                            </button>
                            <button className="other-feature">
                                <MdHelpCenter />
                                <span>
                                    Help Center
                                </span>
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