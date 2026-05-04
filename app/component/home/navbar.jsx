'use client'
import { useState } from "react";
import { usePathname } from "next/navigation";

import { useQuery, useRouterActions } from "@/app/router/router";
import { useAuth } from "@/app/contexts/authContext";

import { signOut } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";

import { LoadingContent } from "../ui/loading";

import { FaListUl, FaChevronDown, FaChevronLeft } from "react-icons/fa";
import { IoSearch, IoSettingsSharp, IoLogOut } from "react-icons/io5";
import { MdEmail, MdNotifications } from "react-icons/md";
import { FaPlus } from "react-icons/fa6";
import { HiUser } from "react-icons/hi2";
import { LuSparkles } from "react-icons/lu";

export default function Navbar({ handleDashboard, redirect }) {
  const pathname = usePathname();
  const { session } = useAuth();

  const [dropdown, setDropdown] = useState(false);

  const queryNavigate = useQuery();
  const { navigateToTask, navigateReplace, navigateBack, navigateToAuth } = useRouterActions();

  const ref = useOutside({
    stateOutside: dropdown,
    setStateOutside: () => setDropdown(false)
  });

  const handleLogout = async () => {
    try {
      redirect(true);
      await signOut({ redirect: false });
      navigateReplace("/auth");
    } catch (error) {
      redirect(false);
    }
  };

  const handleAuth = () => {
    redirect(true);
    navigateToAuth();
  }

  const handleTask = () => {
    redirect(true);
    navigateToTask();
  }

  const toggleDropdown = (e) => {
    e.stopPropagation();
    setDropdown(prev => !prev);
  };

  return (
    <section id='header'>
      <nav id="navbar">
        {/* Left Section - Logo & Menu */}
        <div className="nav-left">
          {(pathname === '/' || pathname === '/home') ? (
            <button className="nav-icon-btn menu-btn" onClick={() => handleDashboard(true)}>
              <FaListUl />
            </button>
          ) : (
            <button className="nav-icon-btn back-btn" onClick={navigateBack}>
              <FaChevronLeft fontSize={16} />
            </button>
          )}
          <div className="nav-brand">
            <div className="brand-logo">
              <svg viewBox="-5 -5 110 95">
                <polygon points="50,0 0,85 100,85" />
              </svg>
            </div>
            <span className="brand-text">CodeDev</span>
          </div>
        </div>

        {/* Search Bar */}
        <button className="nav-search" onClick={() => queryNavigate(pathname, { search: true })}>
          <span className="search-icon"><IoSearch /></span>
          <span className="search-text">Search anything...</span>
          <span className="search-shortcut">
            <kbd>⌘</kbd>
            <kbd>K</kbd>
          </span>
        </button>

        {/* Right Section - Actions */}
        <div className="nav-right">
          {pathname === '/' ? (
            <button className="nav-cta" onClick={handleAuth}>
              <LuSparkles />
              <span>Get Started</span>
            </button>
          ) : (
            <>
              <button className="nav-icon-btn search-mobile" onClick={() => queryNavigate(pathname, { search: true })}>
                <IoSearch />
              </button>

              <button className="nav-icon-btn add-btn" onClick={handleTask}>
                <FaPlus />
              </button>

              <button className="nav-icon-btn notification-btn">
                <MdNotifications />
                <span className="notification-dot" />
              </button>

              {/* Account Dropdown */}
              <div className="nav-account" ref={ref}>
                <button className="account-trigger" onClick={toggleDropdown}>
                  <div className="account-avatar">
                    <HiUser />
                  </div>
                  <div className="account-info">
                    {
                      session ?
                        <span className="account-name">
                          {session?.username.length > 7 ? session.username.slice(0, 7) + '...' : session.username}
                        </span>
                        :
                        <LoadingContent scale={0.5} color={'var(--color_white)'} />
                    }
                  </div>
                  <FaChevronDown fontSize={14} className={`account-arrow ${dropdown ? 'rotated' : ''}`} />
                </button>

                <div className={`account-dropdown ${dropdown ? 'active' : ''}`}>
                  <div className="dropdown-header">
                    <div className="dropdown-avatar">
                      <HiUser />
                    </div>
                    {
                      session ?
                        <div className="dropdown-user">
                          <h4>{session?.username || 'User'}</h4>
                          <p>{session?.email || 'user@email.com'}</p>
                        </div> :
                        <LoadingContent scale={0.5} />
                    }
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-group">
                    <button className="dropdown-item">
                      <span className="item-icon"><MdEmail /></span>
                      <span className="item-label">Messages</span>
                      <span className="item-badge">0</span>
                    </button>
                    <button className="dropdown-item">
                      <span className="item-icon"><MdNotifications /></span>
                      <span className="item-label">Notifications</span>
                      <span className="item-badge">0</span>
                    </button>
                  </div>

                  <div className="dropdown-divider" />

                  <div className="dropdown-group">
                    <button className="dropdown-item highlight" onClick={() => queryNavigate(pathname, { manage: true })}>
                      <span className="item-icon"><IoSettingsSharp /></span>
                      <span className="item-label">Settings</span>
                    </button>
                    <button className="dropdown-item danger" onClick={handleLogout}>
                      <span className="item-icon"><IoLogOut /></span>
                      <span className="item-label">Log out</span>
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </nav>
    </section>
  );
}
