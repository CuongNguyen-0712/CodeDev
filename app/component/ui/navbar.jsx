'use client'
import { useState, useEffect, useTransition } from "react";

import Link from "next/link";

import { LoadingContent } from "./loading";

import { useLogOut } from "@/app/mutation/auth.mutation";

import { useRouterActions } from "@/app/router/useRouterActions";

import { useSession } from "next-auth/react";

import useOutside from "@/app/hooks/useOutside";
import useViewport from "@/app/hooks/useViewport";

import { useApp } from "@/app/contexts/appContext";

import { useQuery } from "@tanstack/react-query";

import { userQueries } from "@/app/query/user.query";

import { useQueryClient } from "@tanstack/react-query";

import { FaChevronDown, FaCoins } from "react-icons/fa";
import { PiListBold } from "react-icons/pi";
import { IoSettingsSharp, IoLogOut } from "react-icons/io5";
import { MdEmail, MdNotifications } from "react-icons/md";
import { HiUser } from "react-icons/hi2";
import { LuSparkles } from "react-icons/lu";

export default function Navbar({ handleDashboard, handleAccountMobile }) {
  const { showAlert: alert } = useApp();
  const { status } = useSession();

  const { data, isLoading, error, isError } = useQuery(userQueries.me(status));
  const { navigateReplace } = useRouterActions();

  const [isNavigating, startTransition] = useTransition();
  const [dropdown, setDropdown] = useState(false);

  const logoutMutation = useLogOut();
  const queryClient = useQueryClient();

  const ref = useOutside({
    stateOutside: dropdown,
    setStateOutside: setDropdown,
  });

  const viewport = useViewport();

  const handleLogout = async () => {
    if (logoutMutation.isPending) return;

    logoutMutation.mutate(null, {
      onSuccess: () => {
        queryClient.clear();
        startTransition(() => {
          navigateReplace('/auth');
        });
      },
      onError: (error) => {
        alert(error.status, error.message);
      }
    });
  };

  const toggleDropdown = () => {
    if (viewport.width < 425) {
      handleAccountMobile(true);
    }
    else {
      setDropdown(!dropdown);
    }
  };

  useEffect(() => {
    if (viewport.width < 425) {
      setDropdown(false);
      if (dropdown) handleAccountMobile(true);
    }
    else {
      handleAccountMobile(false);
    }
  }, [viewport.width]);

  useEffect(() => {
    if (!isError) return;
    alert(error?.status || 500, error?.message || 'Failed to load data, try again.');
  }, [isError]);

  return (
    <section id='header'>
      <nav id="navbar">
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

        <div className="nav-right">
          {
            status === 'loading' ?
              <LoadingContent scale={0.5} color={'var(--white)'} />
              :
              status === 'authenticated' &&
              <>
                <button className="nav_coins_btn">
                  <span>{data?.points || 0}</span>
                  <FaCoins fontSize={16} color="var(--color-warning)" />
                </button>
                <div className="nav-account" ref={ref}>
                  <button className="account-trigger" onClick={toggleDropdown}>
                    <div className="account-avatar">
                      <HiUser />
                    </div>
                    <div className="account-info">
                      {
                        isLoading ?
                          <LoadingContent scale={0.5} color={'var(--white)'} />
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
                              <h4>{data?.username.length > 15 ? `${data?.username.substring(0, 15)}...` : data?.username || "_"}</h4>
                              <p>{data?.email || '_'}</p>
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
                      <button className="dropdown-item" disabled={logoutMutation.isPending}>
                        <span className="item-icon"><MdEmail /></span>
                        <span className="item-label">Messages</span>
                        <span className="item-badge">0</span>
                      </button>
                      <button className="dropdown-item" disabled={logoutMutation.isPending}>
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
                      <button className="dropdown-item danger" onClick={handleLogout} disabled={logoutMutation.isPending || isNavigating}>
                        {
                          logoutMutation.isPending || isNavigating ?
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
