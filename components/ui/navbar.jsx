'use client'
import { useState, useEffect } from "react";

import Link from "next/link";

import { LoadingContent } from "./loading";

import { useLogOut } from "@/mutations/auth.mutation";

import { useSession } from "next-auth/react";

import useOutside from "@/hooks/useOutside";
import useViewport from "@/hooks/useViewport";

import { useApp } from "@/contexts/appContext";

import { userQueries } from "@/queries/user.query";
import { useRouterActions } from "@/router/useRouterActions";

import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";

import { signOut } from "next-auth/react";

import { IoSettingsSharp, IoLogOut } from "react-icons/io5";
import { MdEmail, MdNotifications } from "react-icons/md";
import { LuSparkles } from "react-icons/lu";
import { FaCoins } from "react-icons/fa";
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarRightCollapse } from "react-icons/tb";

export default function Navbar({ isDashboard, handleDashboard, handleAccountMobile }) {
  const { showAlert: alert } = useApp();
  const { status } = useSession();

  const { navigateReplace } = useRouterActions();

  const { data, isLoading, error, isError } = useQuery(userQueries.me(status));

  const [dropdown, setDropdown] = useState(false);

  const queryClient = useQueryClient();
  const logoutMutation = useLogOut();

  const ref = useOutside({
    stateOutside: dropdown,
    setStateOutside: setDropdown,
  });

  const viewport = useViewport();

  const handleLogout = () => {
    if (logoutMutation.isPending) return;

    logoutMutation.mutate(null, {
      onSuccess: async () => {
        queryClient.clear();

        await signOut({ redirect: false });

        navigateReplace('/');
      },
      onError: (error) => {
        alert(error.status, error.message);
      }
    });
  };

  const toggleDropdown = (e) => {
    e.stopPropagation();

    if (viewport.width <= 425) {
      handleAccountMobile(true);
    }
    else {
      setDropdown(!dropdown);
    }
  };

  useEffect(() => {
    if (viewport.width <= 425) {
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
          <button className='nav_sidebar_btn' onClick={() => handleDashboard(prev => !prev)} title="Toggle Sidebar">
            <TbLayoutSidebarLeftCollapse fontSize={20} className={`sidebar_icon left ${isDashboard ? 'active' : ''}`} />
            <TbLayoutSidebarRightCollapse fontSize={20} className={`sidebar_icon right ${isDashboard ? '' : 'active'}`} />
          </button>
        </div>

        <div className="nav-right">
          {
            status === 'loading' ?
              <LoadingContent scale={0.5} color={'var(--color-primary)'} />
              :
              status === 'authenticated' &&
              <>
                <div className="nav-account" ref={ref}>
                  <button className={`account-trigger ${dropdown ? 'active' : ''}`} onClick={toggleDropdown}>
                    <img
                      src={data?.image || '/image/static/no_image.png'}
                      alt="Avatar"
                      className="account-avatar"
                      width={37}
                      height={37}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                      }}
                    />
                    {
                      isLoading ?
                        <LoadingContent scale={0.5} color={'var(--white)'} />
                        :
                        <div className="account-shortcut">
                          <span className="account-name">
                            {data?.email?.length > 10 ? `${data?.email.substring(0, 10)}...` : data?.username || "_"}
                          </span>
                          <p className="account-points">
                            <span className="points-value">
                              {Number(data?.points || 0) > 999 ? `${(Number(data?.points) / 1000).toFixed(1)}k` : data?.points || 0}
                            </span>
                            <FaCoins color={'var(--amber-500)'} fontSize={14} />
                          </p>
                        </div>
                    }
                  </button>

                  <div className={`account-dropdown ${dropdown ? 'active' : ''}`}>
                    {status === "authenticated" ?
                      <>
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
                        <button className="dropdown-points" disabled={logoutMutation.isPending}>
                          <span className="points-label">Points</span>
                          <span className="points-badge">{Number(data?.points || 0) > 999 ? `${(Number(data?.points) / 1000).toFixed(1)}k` : data?.points || 0}</span>
                          <span className="points-icon"><FaCoins fontSize={16} /></span>
                        </button>
                      </>
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
                      <button className="dropdown-item danger" onClick={handleLogout} disabled={logoutMutation.isPending}>
                        {
                          logoutMutation.isPending ?
                            <LoadingContent scale={0.5} color={'var(--rose-500)'} />
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
