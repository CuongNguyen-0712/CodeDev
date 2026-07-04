'use client'
import { useState, useEffect } from "react";

import Link from "next/link";

import { LoadingContent } from "../ui/loading";

import { signOut } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";

import { useAuth } from "@/app/contexts/authContext";
import { useApp } from "@/app/contexts/appContext";

import { useUser } from '@/hooks/use-user';

import { FaChevronDown, FaCoins } from "react-icons/fa";
import { PiListBold } from "react-icons/pi";
import { IoSettingsSharp, IoLogOut } from "react-icons/io5";
import { MdEmail, MdNotifications } from "react-icons/md";
import { HiUser } from "react-icons/hi2";
import { LuSparkles } from "react-icons/lu";

export default function Navbar({ handleDashboard }) {
  const { showAlert: alert } = useApp();
  const { status } = useAuth();
  const { data, isLoading, error } = useUser()

  const [isPending, setIsPending] = useState(null);
  const [dropdown, setDropdown] = useState(false);


  const ref = useOutside({
    stateOutside: dropdown,
    setStateOutside: () => setDropdown(false)
  });

  const handleLogout = async () => {
    setIsPending('logout');
    try {
      await signOut({ redirect: '/auth' });
    } catch (error) {
      alert(error?.status || 500, error?.message || 'Logout failed, please try again.');
      setIsPending(null);
    }
  };

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
          <button className="nav-icon-btn menu-btn" onClick={() => handleDashboard(true)}>
            <PiListBold fontSize={22} />
          </button>
          <div className="nav-brand">
            <div className="brand-logo">
              <svg viewBox="-5 -5 110 95">
                <polygon points="50,0 0,85 100,85" />
              </svg>
            </div>
            <span className="brand-text">CodeDev</span>
          </div>
        </div>

        {/* Right Section - Actions */}
        <div className="nav-right">
          {
            status === 'loading' ?
              <LoadingContent scale={0.5} color={'var(--color_white)'} />
              :
              status === 'authenticated' &&
              <>
                <button className="nav_coins_btn">
                  <span>{data?.points || 0}</span>
                  <FaCoins fontSize={16} color="var(--color_yellow)" />
                </button>
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
                    {status === "authenticated" ?
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
                      :
                      <Link href="/auth" className="dropdown-item authenticated">
                        Please log in again
                      </Link>
                    }

                    <div className="dropdown-divider" />

                    <div className="dropdown-group">
                      <button className="dropdown-item" disabled={isPending}>
                        <span className="item-icon"><MdEmail /></span>
                        <span className="item-label">Messages</span>
                        <span className="item-badge">0</span>
                      </button>
                      <button className="dropdown-item" disabled={isPending}>
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
                      <button className="dropdown-item danger" onClick={handleLogout} disabled={isPending}>
                        {
                          isPending === 'logout' ?
                            <LoadingContent scale={0.5} />
                            :
                            <>
                              <span className="item-icon"><IoLogOut /></span>
                              <span className="item-label">Log out</span>
                            </>
                        }
                      </button>
                    </div>
                  </div>
                </div>
              </>
          }
          {
            status === 'unauthenticated' &&
            <Link className="nav-cta" href="/auth" title="Get Started">
              <LuSparkles />
              <span>Get Started</span>
            </Link>
          }
        </div>
      </nav>
    </section>
  );
}
