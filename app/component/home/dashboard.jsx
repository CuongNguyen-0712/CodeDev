import { useState, useRef, useEffect } from "react";
import { useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { LoadingContent } from "../ui/loading";

import { useAuth } from "@/app/contexts/authContext";

import { useQuery } from "@/app/router/useQuery";

import { FaUsers, FaChevronLeft, FaTasks } from "react-icons/fa";
import { FaCode } from "react-icons/fa6";
import { IoSettingsSharp, IoSearch } from "react-icons/io5";
import {
  MdHelpCenter,
  MdSpaceDashboard,
  MdOutlineFeedback,
} from "react-icons/md";
import { HiChevronDown, HiSparkles } from "react-icons/hi2";

export default function Dashboard({ isDashboard, handleDashboard }) {
  const { session, status } = useAuth();

  const dashBoardRef = useRef(null);
  const pathnameRef = useRef(null);

  const params = useSearchParams();
  const pathname = usePathname();
  const queryNavigate = useQuery();

  const [activeIndex, setActiveIndex] = useState(0);
  const [showOther, setShowOther] = useState(false);

  const menuList = [
    { name: "Overview", value: 'overview', icon: <MdSpaceDashboard />, isAuth: true },
    { name: "Learning", value: 'learning', icon: <FaCode />, isAuth: true },
    { name: "Task", value: 'task', icon: <FaTasks />, isAuth: true },
    { name: "Connection", value: 'connection', icon: <FaUsers />, isAuth: true },
  ];

  const refDashboard = (e) => {
    e.stopPropagation();
    if (!dashBoardRef.current || !isDashboard) return;

    if (!dashBoardRef.current.contains(e.target)) {
      handleDashboard(false);
      document.body.classList.remove('overlay');
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', refDashboard);
    return () => document.removeEventListener('mousedown', refDashboard);
  }, [isDashboard, handleDashboard]);

  useEffect(() => {
    const tab = params.get('tab')?.toLowerCase();
    const index = menuList.findIndex(item => item.value === tab);
    setActiveIndex(index >= 0 ? index : 0);
    pathnameRef.current = pathname;
    handleDashboard(false);
  }, [params]);

  const handleNavigation = (index, value) => {
    scrollTo(0, 0);
    setActiveIndex(index);
    queryNavigate(pathnameRef.current, { tab: value });
  };

  return (
    <aside id="aside" className={isDashboard ? "active" : ""} ref={dashBoardRef}>
      <div id="dashboard">
        {/* Header */}
        <div className="dash-header">
          <div className="dash-brand">
            <Image src="/image/static/logo.svg" alt="logo" width={35} height={35} />
            <span className="brand-name">CodeDev</span>
          </div>
          <button className="dash-close" onClick={() => handleDashboard(false)}>
            <FaChevronLeft fontSize={16} />
          </button>
        </div>

        {/* Quick Search */}
        <div className="dash-search">
          <button className="search-trigger" onClick={() => queryNavigate(pathnameRef.current)}>
            <span className="search-icon"><IoSearch /></span>
            <span className="search-placeholder">Quick search...</span>
            <span className="search-keys">
              <kbd>⌘</kbd>
              <kbd>K</kbd>
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="dash-nav">
          <div className="nav-section">
            <span className="nav-title">Menu</span>
            <ul className="nav-menu">
              {status === 'loading' ?
                <LoadingContent scale={0.5} />
                :
                menuList.filter(item => session ? item.isAuth : !item.isAuth).map((item, index) => (
                  <li key={index}>
                    <button
                      className={`nav-link ${activeIndex === index ? 'active' : ''}`}
                      onClick={() => handleNavigation(index, item.value)}
                    >
                      <span className="link-icon">{item.icon}</span>
                      <span className="link-text">{item.name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </nav>

        {/* Feedback Card */}
        <div className="dash-feedback">
          <div className="feedback-card">
            <span className="feedback-icon"><HiSparkles /></span>
            <p className="feedback-text">Share your thoughts</p>
            <button
              className="feedback-btn"
              onClick={() => queryNavigate(pathnameRef.current, { feedback: true })}
            >
              <MdOutlineFeedback />
              <span>Send Feedback</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        {
          session &&
          <div className={`dash-footer ${showOther ? 'expanded' : ''}`}>
            <button className="footer-toggle" onClick={() => setShowOther(!showOther)}>
              <span className="toggle-text">More Options</span>
              <HiChevronDown className={`toggle-arrow ${showOther ? 'rotated' : ''}`} />
            </button>
            {
              showOther &&
              <div className="footer-content">
                <Link href={'/help'} className="footer-link help">
                  <span className="link-icon"><MdHelpCenter /></span>
                  <span className="link-text">Help Center</span>
                </Link>
                <Link href={'/settings'} className="footer-link settings">
                  <span className="link-icon"><IoSettingsSharp /></span>
                  <span className="link-text">Settings</span>
                </Link>
              </div>
            }
          </div>
        }
      </div>
    </aside>
  );
}
