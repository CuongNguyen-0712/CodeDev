"use client";
import { useState } from "react";

import { useSize } from "@/app/contexts/sizeContext";
import { useQuery, useRouterActions } from "@/app/router/router";
import { usePathname } from "next/navigation";

import Logo from "@/public/image/logo.svg";
import Image from "next/image";

import { FaListUl, FaUserCog } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications } from "react-icons/io";
import { MdEmail, MdWindow, MdAddCircle } from "react-icons/md";

export default function Navbar({ onHome, handleDashboard, handleRedirect }) {
  const { size } = useSize();
  const { height, width } = size;

  const queryNavigate = useQuery();
  const { navigateToAuth } = useRouterActions();
  const pathname = usePathname();

  const [onGroup, setOnGroup] = useState(false);

  return (
    <>
      <nav id="navbar">
        <div className="navbar-items">
          <div className="navbar-feature">
            <button
              id="menu-btn"
              onClick={handleDashboard ? handleDashboard : () => queryNavigate(window.location.pathname, { manage: true })}
              style={
                onHome ? { background: 'var(--color_black)', color: 'var(--color_white)', borderRadius: '5px' } : {}
              }
            >
              {onHome ? <FaUserCog /> : <FaListUl />}
            </button>
            <div id="app-name">
              <Image
                src={Logo}
                height={25}
                width={25}
                alt="CodeDev_logo"
              />
              <h2>CodeDev</h2>
            </div>
          </div>
          {width >= 600 && (
            <button className="search">
              <span>
                <IoSearch />
              </span>
              <span>Search</span>
            </button>
          )}
          <div className="navbar-links">
            {
              pathname == '/' ?
                width >= 425 &&
                <>
                  <button id="navigate-btn" onClick={handleRedirect}>
                    Login or signup
                  </button>
                </>
                :
                <>
                  <button id="todo">
                    <MdAddCircle />
                    <span>Todo</span>
                  </button>
                  {width < 768 && (
                    <>
                      <button id="window-menu" onClick={() => setOnGroup(!onGroup)}>
                        <MdWindow />
                      </button>
                      <div
                        className="group-links"
                        style={{
                          width: `${width}px`,
                          top: `${onGroup ? height - 60 : height}px`,
                          opacity: `${onGroup ? 1 : 0}`,
                        }}
                      >
                        <button className="group-btn" id="mail">
                          <MdEmail />
                          <span>
                            Mail
                          </span>
                        </button>
                        <button className="group-btn" id="noti">
                          <IoMdNotifications />
                          <span>
                            Notification
                          </span>
                        </button>
                        <button id="feedback-btn" onClick={() => queryNavigate(window.location.pathname, { feedback: true })}>
                          Feedback
                        </button>
                      </div>
                    </>
                  )}
                  {width >= 768 && (
                    <>
                      <button id="mail">
                        <MdEmail />
                      </button>
                      <button id="noti">
                        <IoMdNotifications />
                      </button>
                      <button id="feedback-btn" onClick={() => queryNavigate(window.location.pathname, { feedback: true })}>
                        Feedback
                      </button>
                    </>
                  )}
                </>
            }
          </div>
        </div>
      </nav >
    </>
  );
}
