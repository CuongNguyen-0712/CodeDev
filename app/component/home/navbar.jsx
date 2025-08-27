"use client";
import { useState } from "react";

import { useSize } from "@/app/contexts/sizeContext";
import { useQuery } from "@/app/router/router";
import { usePathname } from "next/navigation";
import { useAuth } from "@/app/contexts/authContext";

import useOutside from "@/app/hooks/useOutside";

import Image from "next/image";

import { FaListUl, FaUserCog, FaRegUserCircle } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { MdAddCircle, MdEmail, MdNotifications } from "react-icons/md";

export default function Navbar({ handleDashboard, handleRedirect }) {
  const pathname = usePathname();
  const { size } = useSize();
  const { session } = useAuth();

  const [state, setState] = useState(false);

  const queryNavigate = useQuery();

  const ref = useOutside({
    stateOutside: state,
    setStateOutside: () => setState(false)
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
            <div id="app-name">
              <Image
                src={'/image/static/logo.svg'}
                height={25}
                width={25}
                alt="CodeDev_logo"
              />
              <h2>CodeDev</h2>
            </div>
          </div>
          {size.width >= 600 && (
            <button className="search">
              <span>
                <IoSearch />
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
                  <button id="todo">
                    <MdAddCircle />
                    <span>Todo</span>
                  </button>
                  <button
                    id="account"
                    onClick={(e) => {
                      e.stopPropagation();
                      setState(!state);
                    }}
                  >
                    <div className="logo_account">
                      <svg className="account_svg" viewBox="-5 -5 110 95">
                        <polygon
                          className="logo_svg"
                          points="50,0 0,85 100,85" />
                      </svg>
                    </div>
                  </button>
                  {
                    state &&
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
                        <FaUserCog />
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
