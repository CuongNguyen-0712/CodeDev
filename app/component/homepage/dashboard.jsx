import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useSize } from "@/app/contexts/sizeContext";

import Image from "next/image";

import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from 'react-icons/fa6';
import { MdInfoOutline, MdOutlineClose } from "react-icons/md";
import { VscProject } from "react-icons/vsc";

export default function Dashboard({ isDashboard, handleDashboard, handleRedirect }) {
    const params = useSearchParams();
    const { size } = useSize();
    const refNavigation = useRef(null);

    const [targetItem, setTargetItem] = useState(0);

    const handleNavigation = (index, name) => {
        refNavigation.current.style.top = `${index * 50}px`;
        setTargetItem(index);
        queryNavigate(window.location.pathname, { target: index, name: name })
    };

    useEffect(() => {
        const menuBtns = document.querySelectorAll('.menu-item button')
        const index = params.get('target') || 0
        refNavigation.current.style.top = `${index * 50}px`;
        menuBtns.forEach(btn => btn.classList.remove('active'))
        menuBtns[index].classList.add('active')
    }, [params])

    const menuList = [
        {
            name: "Roadmap",
            icon: <GoProjectRoadmap />,
        },
        {
            name: "Course",
            icon: <FaCode />,
        },
        {
            name: 'Project',
            icon: <VscProject />
        },
        {
            name: "About",
            icon: <MdInfoOutline />
        }
    ]

    return (
        <div id='dashboard'>
            <div className="header">
                <Image src={'/image/static/logo.svg'} alt="logo" width={35} height={35} />
                <h3>CodeDev</h3>
            </div>
            <div className="main-menu">
                <div className="menu">
                    {menuList.map((item, index) => (
                        <div className='menu-item' key={index}>
                            <button
                                className={item.name === targetItem ? 'active' : ''}
                                onClick={() =>
                                    handleNavigation(index, item.name)
                                }
                            >
                                {item.icon}
                                <span>{item.name}</span>
                            </button>
                        </div>
                    ))}
                    <span id="navigation" ref={refNavigation}></span>
                </div>
            </div>
            {
                size.width < 425 &&
                <div className="navigate-auth">
                    <h3>Please login your account or sign up to see more CodeDev</h3>
                    <button onClick={handleRedirect}>
                        Go to login or sign up
                    </button>
                </div>
            }
            {
                isDashboard &&
                <button id="hidden-menu" onClick={handleDashboard}>
                    <MdOutlineClose fontSize={16} />
                </button>
            }
        </div>
    )
}