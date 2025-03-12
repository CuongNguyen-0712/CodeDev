"use client";
import { useRef, useState, useEffect } from "react";

import { useSize } from "@/app/contexts/sizeContext";
import Feedback from "@/app/component/home/feedback";
import { useRouterActions, useQuery } from "@/app/router/router";
import { useSearchParams, usePathname } from "next/navigation";

import Manage from "./manage";

import { FaListUl, FaHome } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications } from "react-icons/io";
import { MdEmail, MdWindow, MdAddCircle } from "react-icons/md";

export default function Navbar({ onHome, handleDashboard }) {
  const { size } = useSize();
  const { height, width } = size;

  const { navigateToHome } = useRouterActions();
  const queryNavigate = useQuery();
  const params = useSearchParams();
  const pathname = usePathname();

  const refGroup = useRef(null);

  const [onGroup, setOnGroup] = useState(false);
  const [menu, setMenu] = useState(false)
  const [onFeedback, setOnFeedback] = useState(false);
  const [onManage, setOnManage] = useState(false);

  useEffect(() => {
    if (params.get("manage")) {
      setOnManage(true)
      document.body.style.overflow = "hidden";
    }
    else if (params.get("feedback")) {
      setOnFeedback(true)
      document.body.style.overflow = "hidden";
    }
    else {
      setOnManage(false)
      setOnFeedback(false)
      document.body.style.overflow = "unset";
    }
  }, [params])

  const refFocus = (e) => {
    if (refGroup.current && !refGroup.current.contains(e.target)) {
      setOnGroup(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", refFocus);

    return () => {
      document.removeEventListener("mousedown", refFocus);
    };
  }, []);

  return (
    <>
      <nav id="navbar">
        <div className="navbar-items">
          <div className="navbar-feature">
            <button
              id="menu-btn"
              onClick={handleDashboard ? handleDashboard : () => setMenu(!menu)}
              style={
                onHome ? { background: 'var(--color_black)', color: 'var(--color_white)', borderRadius: '5px' } : {}
              }
            >
              {onHome ? <FaHome /> : <FaListUl />}
            </button>
            <div id="app-name">
              <img
                src="/image/logo.svg"
                height={25}
                width={25}
                alt="CodeDev_logo"
              />
              <h2>CodeDev</h2>
            </div>
            {(onHome && menu) &&
              <div id="menuHome">
                <button onClick={() => queryNavigate(window.location.pathname, { manage: true })}>Manage account</button>
                <button onClick={navigateToHome}>Back to home</button>
              </div>
            }
          </div>
          {width >= 600 && (
            <button className="search">
              <span>
                <IoSearch />
              </span>
              <span>Search</span>
            </button>
          )}
          {
            pathname != '/' &&
            <div className="navbar-links">
              <button id="todo">
                <MdAddCircle />
                {width > 900 && <span>Todo</span>}
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
                    }}
                    ref={refGroup}
                  >
                    <button className="group-btn" id="mail">
                      Mail
                      <MdEmail />
                    </button>
                    <button className="group-btn" id="noti">
                      Noti
                      <IoMdNotifications />
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
            </div>
          }
        </div>
      </nav>
      {onFeedback ?
        <div className="feedback-overlay">
          <Feedback />
        </div>
        :
        null
      }
      {
        onManage ?
          <div className="manage-overlay">
            <Manage />
          </div>
          :
          null
      }
    </>
  );
}
