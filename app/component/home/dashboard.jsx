'use client'
import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import Image from "next/image";
import { useQuery } from "@/app/router/router";

import {
  FaUsers,
  FaAngleLeft,
} from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from "react-icons/fa6";
import { IoSettingsSharp } from "react-icons/io5";
import {
  MdHelpCenter,
  MdSpaceDashboard,
  MdEmojiEvents,
  MdOutlineClose,
} from "react-icons/md";
import { VscProject } from "react-icons/vsc";

export default function Dashboard({ handleDashboard }) {
  const queryNavigate = useQuery()
  const refNavigation = useRef(null);

  const [targetItem, setTargetItem] = useState(0);
  const [showOther, setShowOther] = useState(false);

  const params = useSearchParams();

  const menuList = [
    {
      name: "Overview",
      icon: <MdSpaceDashboard />,
    },
    {
      name: "Course",
      icon: <FaCode />,
    },
    {
      name: "Project",
      icon: <VscProject />
    },
    {
      name: "Social",
      icon: <FaUsers />,
    },
    {
      name: "Roadmap",
      icon: <GoProjectRoadmap />,
    },
    {
      name: "Event",
      icon: <MdEmojiEvents />,
    },
  ];

  useEffect(() => {
    const menuBtns = document.querySelectorAll('.menu-item button')
    const index = params.get('target') || 0
    refNavigation.current.style.top = `${index * 50}px`;
    menuBtns.forEach(btn => btn.classList.remove('active'))
    menuBtns[index].classList.add('active')
  }, [params])

  const handleNavigation = (index, name) => {
    refNavigation.current.style.top = `${index * 50}px`;
    setTargetItem(index);
    queryNavigate(window.location.pathname, { target: index, name: name })
  };

  return (
    <>
      <div id="dashboard">
        <div className="header">
          <Image src={`./image/logo.svg`} alt="logo" width={20} height={20} />
          <h2>CodeDev</h2>
        </div>
        <div className="main-menu">
          <div className="menu">
            {menuList.map((item, index) => (
              <div className='menu-item' key={index}>
                <button
                  className={targetItem === index ? 'active' : ''}
                  onClick={() =>
                    handleNavigation(index, item.name)
                  }
                >
                  {item.icon}
                  <span>{item.name}</span>
                </button>
              </div>
            ))}
          </div>
          <span id="navigation" ref={refNavigation}></span>
        </div>
        <div id="manage" onClick={() => queryNavigate('/home', { manage: true })}>
          <button>Open account manager</button>
        </div>
        <div className="footer-menu" style={showOther ? { height: '100px', transition: '0.2s all ease' } : { height: '50px', transition: '0.2s all ease' }}>
          <div onClick={() => setShowOther(!showOther)} className="heading">
            <span>
              Other
            </span>
            <FaAngleLeft
              style={{
                transform: showOther ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "0.5s all ease",
              }}
            />
          </div>
          <div className="other-frame" style={showOther ? { display: 'flex' } : { display: "none" }}>
            <button id="help">
              <MdHelpCenter />
              Help Center
            </button>
            <button id="settings">
              <IoSettingsSharp />
            </button>
          </div>
        </div>
        <button id="hidden-menu" onClick={handleDashboard}>
          <MdOutlineClose />
        </button>
      </div>
    </>
  );
}
