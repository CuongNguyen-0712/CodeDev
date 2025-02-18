'use client'
import { useState, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import Image from "next/image";
import RouterPush from "@/app/lib/router";

import {
  FaUsers,
  FaAngleLeft,
  FaAngleRight,
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
import { AiFillProject } from "react-icons/ai";

export default function Dashboard({
  handleSetContent,
  sizeDevice,
  handleRedirect,
  handleMenu,
}) {
  const router = useRouter();
  const {
    navigateToCourse,
    navigateToEvent,
    navigateToMember,
    navigateToAuth,
  } = RouterPush();
  const refNavigation = useRef(null);

  const [targetItem, setTargetItem] = useState(0);
  const [showOther, setShowOther] = useState(false);
  const params = useSearchParams();

  const createQuery = (index, name) => {
    const newQuery = new URLSearchParams();
    newQuery.set('target', index)
    newQuery.set('name', name)
    router.push(`?${newQuery.toString()}`);
  }

  const handleNavigation = (index, name, handle, navigate) => {
    refNavigation.current.style.top = `${index * 50}px`;
    setTargetItem(index);
    if (typeof handle === "function" && typeof navigate === "undefined") {
      createQuery(index, name)
    } else if (
      typeof navigate === "function" &&
      typeof handle === "undefined"
    ) {
      navigate();
      handleRedirect();
    }
  };

  const menuList = [
    {
      tagClass: "overview-frame",
      name: "Overview",
      icon: <MdSpaceDashboard />,
      handle: handleSetContent,
      index: 0,
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
          navigate: navigateToCourse,
        },
      ],
    },
    {
      tagClass: "project-frame",
      name: "Project",
      icon: <AiFillProject />,
      links: [
        {
          name: "My project",
          handle: handleSetContent,
          index: 0,
        },
        {
          name: "Teams project",
          handle: handleSetContent,
          index: 0,
        },
      ],
    },
    {
      tagClass: "member-frame",
      name: "Member",
      icon: <FaUsers />,
      links: [
        {
          name: "Teams",
          handle: handleSetContent,
          index: 0,
        },
        {
          name: "Friends",
          handle: handleSetContent,
          index: 0,
        },
        {
          name: "Social",
          navigate: navigateToMember,
        },
      ],
    },
    {
      tagClass: "roadmap-frame",
      name: "Roadmap",
      icon: <GoProjectRoadmap />,
      handle: handleSetContent,
      index: 2,
    },
    {
      tagClass: "event-frame",
      name: "Event",
      icon: <MdEmojiEvents />,
      navigate: navigateToEvent,
    },
  ];

  return (
    <div id="dashboard">
      <div className="main-menu">
        <div className="heading">
          <Image src={`./image/logo.svg`} alt="" width={20} height={20} />
          <h2>CodeDev</h2>
        </div>
        <div className="menu-frame">
          <div className="menu">
            {menuList.map((item, index) => (
              <div className={item.tagClass} key={index}>
                <button
                  className={targetItem === index ? 'active' : ''}
                  onClick={() =>
                    handleNavigation(index, item.name, item.handle, item.navigate)
                  }
                >
                  {item.icon}
                  <span>{item.name}</span>
                  {item.links && (
                    <FaAngleRight
                      style={{
                        position: "absolute",
                        display: "flex",
                        top: "11px",
                        right: "10px",
                        transform:
                          index === targetItem
                            ? "rotate(90deg)"
                            : "rotate(0deg)",
                        transition: "0.5s all ease",
                        opacity: index === targetItem ? "1" : "0.5",
                      }}
                    />
                  )}
                </button>
                {item.links && (
                  <div className="list" style={targetItem === index ? { height: 'max-content', padding: '10px 0', transition: '0.5s all ease' } : { height: '0', padding: '0', transition: '0.2s all ease' }}>
                    {item.links.map((link, index) => (
                      <button
                        key={index}
                        onClick={() =>
                          handleNavigation(
                            link.index,
                            link.name,
                            link.handle,
                            link.navigate
                          )
                        }
                      >
                        {link.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            <span className="navigation" ref={refNavigation}></span>
          </div>
        </div>
      </div>
      <div id="manage">
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
      <button id="hidden-menu" onClick={handleMenu}>
        <MdOutlineClose />
      </button>
    </div>
  );
}
