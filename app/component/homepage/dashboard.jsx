import { useState, useEffect, useRef } from "react";

import Image from "next/image";

import RouterPush from "@/app/lib/router";

import { FiMoon, FiSun } from "react-icons/fi";
import { FaLaptopCode } from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from 'react-icons/fa6';
import { MdInfoOutline } from "react-icons/md";

export default function Dashboard({ sizeDevice, handleRedirect }) {

    const { navigateToAuth } = RouterPush();

    const refNavigation = useRef(null);

    const [layoutHeight, setLayoutHeight] = useState(false);

    const [targetItem, setTargetItem] = useState(0);
    const [targetBtn, setTargetBtn] = useState(2);

    const handleNavigation = (index, navigate) => {
        refNavigation.current.style.top = `${index * 49}px`;
        setTargetItem(index);
        if (typeof navigate === 'function') {
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
            tagClass: "roadmap-frame",
            name: "Roadmap",
            icon: <GoProjectRoadmap />,
        },
        {
            tagClass: "course-frame",
            name: "Course",
            icon: <FaCode />,
        },
        {
            tagClass: "about-frame",
            name: "About",
            icon: <MdInfoOutline />
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
                <h2 style={{ alignItems: 'center', justifyContent: 'center', display: 'flex', gap: '10px' }}>
                    <Image src='/image/logo.svg' alt="logo" height={30} width={30} style={{ outline: 'none' }} />
                    CodeDev
                </h2>
            </header>
            <div className="main-menu">
                <h3>Main menu</h3>
                <div className="menu-frame">
                    <div className="menu">
                        {menuList.map((item, index) => (
                            <div className={item.tagClass} key={index}>
                                <button className={`${targetItem === index ? 'active' : ''}`} onClick={() => handleNavigation(index, item.handle)}>
                                    {item.icon}
                                    <span>{item.name}</span>
                                </button>
                                {(item.links && index === targetItem) &&
                                    <ul className="list">
                                        {item.links.map((link, index) => (
                                            <li key={index} onClick={() => handleNavigation(link.index, link.handle, link.navigate)}>
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
                    <h3>Please login your account or sign up to see more CodeDev</h3>
                    <button onClick={() => {
                        navigateToAuth();
                        handleRedirect();
                    }}>Go to login or sign up</button>
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