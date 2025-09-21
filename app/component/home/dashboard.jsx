'use client'
import { useState, useRef, useEffect } from "react";

import { useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";

import { useQuery } from "@/app/router/router";
import { useSize } from "@/app/contexts/sizeContext";

import { FaUsers, FaAngleLeft } from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from "react-icons/fa6";
import { IoSettingsSharp, IoSearch } from "react-icons/io5";
import {
  MdHelpCenter,
  MdSpaceDashboard,
  MdEmojiEvents,
  MdOutlineClose,
} from "react-icons/md";
import { VscProject } from "react-icons/vsc";

export default function Dashboard({ handleDashboard }) {
  const { size } = useSize();
  const refNavigation = useRef(null);
  const params = useSearchParams();
  const pathname = usePathname();
  const queryNavigate = useQuery()

  const [targetItem, setTargetItem] = useState('Overview');
  const [showOther, setShowOther] = useState(false);


  const menuList = [
    {
      index: 0,
      name: "Overview",
      icon: <MdSpaceDashboard />,
    },
    {
      index: 1,
      name: "Course",
      icon: <FaCode />,
    },
    {
      index: 2,
      name: "Project",
      icon: <VscProject />
    },
    {
      index: 3,
      name: "Social",
      icon: <FaUsers />,
    },
    {
      index: 4,
      name: "Roadmap",
      icon: <GoProjectRoadmap />,
    },
    {
      index: 5,
      name: "Event",
      icon: <MdEmojiEvents />,
    },
  ];

  useEffect(() => {
    const menuBtns = document.querySelectorAll('.menu-item button')
    const index = menuList.find(item => String.prototype.toLowerCase.call(item.name) === params.get('name'))?.index || 0
    refNavigation.current.style.top = `${index * 50}px`;
    menuBtns.forEach(btn => btn.classList.remove('active'))
    menuBtns[index].classList.add('active')
  }, [params])

  const handleNavigation = (index, name) => {
    refNavigation.current.style.top = `${index * 50}px`;
    setTargetItem(name);
    queryNavigate(window.location.pathname, { name: String.prototype.toLowerCase.call(name) })
  };

  return (
    <>
      <div id="dashboard">
        <div className="header">
          <Image src={'/image/static/logo.svg'} alt="logo" width={20} height={20} />
          <h3>CodeDev</h3>
        </div>
        <div className="main-menu">
          {
            size.width < 700 &&
            <button
              className="search_in_dashboard"
              onClick={() => queryNavigate(pathname, { search: true })}
            >
              <IoSearch fontSize={16} />
              <span>Search something</span>
            </button>
          }
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
        <div id="handler_dashboard">
          <button id="feedback" onClick={() => queryNavigate(window.location.pathname, { feedback: true })}>
            Feedback
          </button>
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
          <MdOutlineClose fontSize={16} />
        </button>
      </div>
    </>
  );
}
