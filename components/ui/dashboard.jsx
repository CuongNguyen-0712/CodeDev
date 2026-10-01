'use client';
import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { LoadingContent } from "./loading";
import { useAuth } from "@/contexts/authContext";
import { useRouterActions } from "@/router/useRouterActions";
import { useQueryParams } from "@/router/useQueryParams";

import { FaHome, FaBookOpen, FaRegQuestionCircle, FaCode, FaChevronLeft } from "react-icons/fa";
import { IoSettingsSharp } from "react-icons/io5";
import { MdHelpCenter, MdOutlineFeedback } from "react-icons/md";
import { HiChevronDown, HiChevronRight } from "react-icons/hi2";
import { RiRoadMapFill } from "react-icons/ri";
import { MdQuestionAnswer, MdConnectWithoutContact } from "react-icons/md";
import { IoMdContacts } from "react-icons/io";
import { BiLogIn } from "react-icons/bi";

export default function Dashboard({ isDashboard, handleDashboard }) {
  const { session, status } = useAuth();
  const pathname = usePathname();
  const { navigate } = useRouterActions();
  const updateQuery = useQueryParams();

  const [showOther, setShowOther] = useState(false);

  const navigationList = [
    {
      title: 'Quick Access',
      items: [
        { name: 'Home', value: 'home', icon: <FaHome />, color: 'var(--blue-500)', access: 'auth' },
        { name: 'Learning', value: 'learning', icon: <FaCode />, color: 'var(--color-danger)', access: 'auth' },
        { name: 'Course', value: 'course', icon: <FaBookOpen />, color: 'var(--purple-500)', access: 'public' },
      ]
    },
    {
      title: 'Learning Resources',
      items: [
        { name: 'Roadmap', value: 'roadmap', icon: <RiRoadMapFill />, color: 'var(--teal-500)', access: 'public' },
        { name: 'Blog', value: 'blog', icon: <MdQuestionAnswer />, color: 'var(--color-secondary)', access: 'public' },
      ]
    },
    {
      title: 'Community',
      items: [
        { name: 'Contact', value: 'contact', icon: <IoMdContacts />, color: 'var(--color-warning)', access: 'auth' },
        { name: 'Connect', value: 'connect', icon: <MdConnectWithoutContact />, color: 'var(--pink-500)', access: 'public' },
      ]
    },
    {
      title: 'Information',
      items: [
        { name: 'About', value: 'about', icon: <FaRegQuestionCircle />, color: 'var(--blue-500)', access: 'public' },
      ]
    }
  ];

  const menus = session
    ? navigationList
    : navigationList
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => item.access === 'public')
      }))
      .filter((section) => section.items.length > 0);

  const asideRef = useRef(null);

  // Click outside to collapse dashboard ONLY when window size < 768px (no effect on desktop)
  useEffect(() => {
    if (!isDashboard) return;

    const handleClickOutside = (event) => {
      if (typeof window === 'undefined' || window.innerWidth >= 768) return;

      if (event.target.closest('.nav_sidebar_btn')) return;

      if (asideRef.current && !asideRef.current.contains(event.target)) {
        handleDashboard(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isDashboard, handleDashboard]);

  // Close sidebar on Escape key
  useEffect(() => {
    if (!isDashboard) return;

    if (typeof window === 'undefined') return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleDashboard(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDashboard, handleDashboard]);

  const handleRouter = (value) => {
    const targetPath = value === 'home'
      ? (session ? '/home' : '/')
      : `/${value}`;

    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;

    if (isItemActive(value)) {
      if (isMobile) {
        handleDashboard(false);
      }
      return;
    }

    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      if (isMobile) {
        handleDashboard(false);
      }
    }

    navigate({ path: targetPath });
  };

  const isItemActive = (value) => {
    if (value === 'home') {
      return pathname === '/' || pathname === '/home';
    }
    return pathname === `/${value}` || pathname.startsWith(`/${value}/`);
  };

  return (
    <aside
      id="aside"
      className={isDashboard ? 'expanded' : 'collapsed'}
      ref={asideRef}
      aria-label="Sidebar Navigation"
      aria-hidden={!isDashboard}
    >
      <div id="dashboard">
        <div className="dash-header">
          <div className="dash-brand">
            <img
              src="/image/static/logo.svg"
              alt="CodeDev Logo"
              height={35}
              width={35}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/image/static/no_image.png';
              }}
              className="dash-logo"
            />
            <button className="dash-title" onClick={() => handleRouter('home')}>CodeDev</button>
          </div>
          <button className="dash-close" onClick={() => handleDashboard(false)} aria-label="Close Sidebar">
            <FaChevronLeft fontSize={16} />
          </button>
        </div>
        {/* Navigation */}
        <nav className="dash-nav">
          {status === 'loading' ? (
            <LoadingContent scale={0.5} />
          ) : (
            menus.map((section, index) => (
              <div key={index} className="nav-section">
                <div className="nav-section-header">
                  <h5 className="nav-title">{section.title}</h5>
                  <span className="nav-line"></span>
                </div>
                <ul className="nav-menu">
                  {section.items?.map((child, idx) => {
                    const active = isItemActive(child.value);
                    return (
                      <li key={idx} className="nav-item">
                        <button
                          type="button"
                          className={`nav-link ${active ? 'active' : ''}`}
                          onClick={() => handleRouter(child.value)}
                          aria-current={active ? 'page' : undefined}
                        >
                          <span
                            className="link-icon"
                            style={{ '--item-color': child.color }}
                          >
                            {child.icon}
                          </span>
                          <span className="link-text">{child.name}</span>
                          <HiChevronRight className="link-arrow" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </nav>

        {/* Footer */}
        {session ? (
          <div className={`dash-footer ${showOther ? 'expanded' : ''}`}>
            <button
              type="button"
              className="footer-link feedback"
              onClick={() => {
                if (typeof window !== 'undefined' && window.innerWidth < 768) {
                  handleDashboard(false);
                }
                updateQuery({ modal: 'feedback' });
              }}
            >
              <span className="link-icon"><MdOutlineFeedback /></span>
              <span className="link-text">Feedback</span>
            </button>
            <button
              type="button"
              className="footer-link settings"
              onClick={() => handleRouter('settings')}
            >
              <span className="link-icon"><IoSettingsSharp /></span>
            </button>
          </div>
        ) : (
          <div className="dash-footer-guest">
            <button
              type="button"
              className="dash-guest-cta"
              onClick={() => handleRouter('auth')}
            >
              <BiLogIn fontSize={20} />
              <span>
                Get Started
              </span>
            </button>
          </div>
        )}
      </div>
    </aside >
  );
}
