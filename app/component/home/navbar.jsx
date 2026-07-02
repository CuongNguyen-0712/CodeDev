'use client'
import { useState, useEffect } from "react";

import { usePathname } from "next/navigation";
import Link from "next/link";

import { useRouterActions } from "@/app/router/useRouterActions";

import { signOut } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";

import { LoadingContent } from "../ui/loading";

import { useAuth } from "@/app/contexts/authContext";
import { useApp } from "@/app/contexts/appContext";

import { useUser } from '@/hooks/use-user';

import { FaChevronDown, FaChevronLeft, FaCoins } from "react-icons/fa";
import { PiListBold } from "react-icons/pi";
import { IoSettingsSharp, IoLogOut } from "react-icons/io5";
import { MdEmail, MdNotifications } from "react-icons/md";
import { HiUser } from "react-icons/hi2";
import { LuSparkles } from "react-icons/lu";

export default function Navbar({ handleDashboard, redirect }) {
  const pathname = usePathname();
  const { showAlert: alert } = useApp();
  const { session, status } = useAuth();
  const { data, isLoading, error } = useUser()

  const [dropdown, setDropdown] = useState(false);

  const { navigateReplace, navigateBack, navigate } = useRouterActions();

  const linkMapping = [
    { label: 'Home', path: '/home', isAuth: true },
    { label: 'Course', path: '/course', isAuth: true },
    { label: 'Roadmap', path: '/roadmap', isAuth: true },
    { label: 'Blog', path: '/blog', isAuth: true },
    { label: 'About', path: '/about', isAuth: false },
  ]

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
    navigate("/auth");
  }

  const toggleDropdown = (e) => {
    e.stopPropagation();
    setDropdown(prev => !prev);
  };

  useEffect(() => {
    if (!error) return;
    alert(error?.status || 500, error?.message || 'Failed to fetch user data.');
  }, [error]);

  return (
    <section id='header'>
      <nav id="navbar">
        {/* Left Section - Logo & Menu */}
        <div className="nav-left">
          {(pathname === '/' || pathname === '/home') ? (
            <button className="nav-icon-btn menu-btn" onClick={() => handleDashboard(true)}>
              <PiListBold fontSize={22} />
            </button>
          ) : (
            <button className="nav-icon-btn back-btn" onClick={() => navigateBack('/home')}>
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

        <div className="nav_center">
          {status === "loading" ?
            <LoadingContent scale={0.5} color={'var(--color_white)'} />
            :
            linkMapping.filter((link) => session ? link.isAuth : !link.isAuth).map((link, index) => (
              <Link
                key={index}
                href={link.path}
                className={`nav_links ${pathname === link.path ? 'active' : ''}`}
              >
                {link.label}
              </Link>
            ))
          }
        </div>

        {/* Right Section - Actions */}
        <div className="nav-right">
          {pathname === '/' ? (
            <button className="nav-cta" onClick={handleAuth}>
              <LuSparkles />
              <span>Get Started</span>
            </button>
          ) : (
            <>
              <button className="nav_coins_btn">
                <span>{data?.points || 0}</span>
                <FaCoins fontSize={16} color="var(--color_yellow)" />
              </button>

              {/* Account Dropdown */}
              <div className="nav-account" ref={ref}>
                <button className="account-trigger" onClick={toggleDropdown}>
                  <div className="account-avatar">
                    <HiUser />
                  </div>
                  <div className="account-info">
                    {
                      isLoading ?
                        <LoadingContent scale={0.5} color={'var(--color_white)'} />
                        :
                        (
                          <span className="account-name">
                            {data?.username?.length > 7 ? `${data?.username.substring(0, 7)}...` : data?.username || "______"}
                          </span>
                        )
                    }
                  </div>
                  <FaChevronDown fontSize={14} className={`account-arrow ${dropdown ? 'rotated' : ''}`} />
                </button>

                <div className={`account-dropdown ${dropdown ? 'active' : ''}`}>
                  {status === "loading" ?
                    <Link href="/auth" className="dropdown-item authenticated">
                      Please log in again
                    </Link>
                    :
                    <Link href="/profile" className="dropdown-header">
                      <img
                        className="dropdown-avatar"
                        src={data?.image || '/image/static/no_image.png'}
                        alt="Avatar"
                        width={50}
                        height={50}
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = '/image/static/no_image.png';
                        }}
                      />
                      {
                        isLoading ?
                          <LoadingContent scale={0.5} />
                          :
                          <div className="dropdown-user">
                            <h4>{data?.username.length > 15 ? `${data?.username.substring(0, 15)}...` : data?.username || "Unknown"}</h4>
                            <p>{data?.email || 'user@email.com'}</p>
                          </div>
                      }
                    </Link>
                  }

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
                    <Link href="/settings" className="dropdown-item highlight">
                      <span className="item-icon"><IoSettingsSharp /></span>
                      <span className="item-label">Settings</span>
                    </Link>
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
