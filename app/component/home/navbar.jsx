"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";

import { useQuery } from "@/app/router/router";
import { useSize } from "@/app/contexts/sizeContext";
import { useAuth } from "@/app/contexts/authContext";

import useOutside from "@/app/hooks/useOutside";

import { FaListUl, FaUserCog, FaRegUserCircle, FaChevronDown } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { MdEmail, MdNotifications, MdAccountBox } from "react-icons/md";

export default function Navbar({ handleDashboard, handleRedirect }) {
  const pathname = usePathname();
  const { size } = useSize();
  const { session } = useAuth();

  const [state, setState] = useState({
    dropdown: false,
  });

  const queryNavigate = useQuery();

  const ref = useOutside({
    stateOutside: state.dropdown,
    setStateOutside: () => setState((prev) => ({
      ...prev,
      dropdown: false
    }))
  })

  return (
    <>
      <nav id="navbar">
        <div className="navbar-items">
          <div className="navbar-feature">
            {
              pathname === '/home' &&
              <button
                id="menu-btn"
                onClick={handleDashboard}
              >
                <FaListUl />
              </button>
            }
            <div id="app_name">
              <div className="logo">
                <svg className="svg" viewBox="-5 -5 110 95">
                  <polygon
                    className="shape"
                    points="50,0 0,85 100,85" />
                </svg>
              </div>
              <h2>CodeDev</h2>
            </div>
          </div>
          {size.width >= 700 && (
            <button
              className="search"
              onClick={() =>
                queryNavigate(pathname, { search: true })
              }
            >
              <span>
                <IoSearch fontSize={18} />
              </span>
              <span>Search something</span>
            </button>
          )}
          <div className="navbar-links">
            {
              pathname == '/' ?
                <button id="navigate-btn" onClick={handleRedirect}>
                  Login or signup
                </button>
                :
                <div className="navbar_handler">
                  {
                    (pathname !== '/home' && size.width < 700) &&
                    <button
                      id="search_icon"
                      onClick={() =>
                        queryNavigate(pathname, { search: true })
                      }
                    >
                      __
                      <IoSearch fontSize={18} />
                    </button>
                  }
                  <button
                    id="account"
                    onClick={(e) => {
                      e.stopPropagation();
                      setState((prev) => ({
                        ...prev,
                        dropdown: !prev.dropdown
                      }));
                    }}
                  >
                    <MdAccountBox fontSize={22} />
                    {
                      size.width >= 500 &&
                      <span>Account</span>
                    }
                    <FaChevronDown
                      style={{
                        transform: state.dropdown ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: '0.2s all ease'
                      }}
                    />
                  </button>
                  {
                    state.dropdown &&
                    <div className="drop_down" ref={ref} >
                      <div id="tag_account">
                        <FaRegUserCircle fontSize={20} />
                        <p>{session.username}</p>
                      </div>
                      <button>
                        <MdEmail />
                        Mail
                        <span>
                          0
                        </span>
                      </button>
                      <button>
                        <MdNotifications />
                        Notification
                        <span>
                          0
                        </span>
                      </button>
                      <button onClick={() => queryNavigate(pathname, { manage: true })}>
                        <FaUserCog fontSize={16} />
                        Manage
                      </button>
                    </div>
                  }
                </div>
            }
          </div>
        </div>
      </nav >
    </>
  );
}
