import { useState, useRef, useEffect } from "react";

import { useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";

import { useQuery } from "@/app/router/router";

import { FaUsers, FaCrown } from "react-icons/fa";
import { GoProjectRoadmap } from "react-icons/go";
import { FaCode } from "react-icons/fa6";
import { IoSettingsSharp, IoSearch, IoClose } from "react-icons/io5";
import {
  MdHelpCenter,
  MdSpaceDashboard,
  MdEmojiEvents,
  MdOutlineFeedback
} from "react-icons/md";
import { VscProject } from "react-icons/vsc";
import { HiChevronDown, HiSparkles } from "react-icons/hi2";

export default function Dashboard({ isDashboard, handleDashboard }) {
  const dashBoardRef = useRef(null);
  const pathnameRef = useRef(null);

  const params = useSearchParams();
  const pathname = usePathname();
  const queryNavigate = useQuery();

  const [activeIndex, setActiveIndex] = useState(0);
  const [showOther, setShowOther] = useState(false);

  const menuList = [
    { name: "Overview", icon: <MdSpaceDashboard />, badge: null },
    { name: "Learning", icon: <FaCode />, badge: "5" },
    { name: "Project", icon: <VscProject />, badge: null },
    { name: "Social", icon: <FaUsers />, badge: "12" },
    { name: "Roadmap", icon: <GoProjectRoadmap />, badge: null },
    { name: "Event", icon: <MdEmojiEvents />, badge: "3" },
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
    const index = menuList.findIndex(item => item.name.toLowerCase() === tab);
    setActiveIndex(index >= 0 ? index : 0);
    pathnameRef.current = pathname;
    handleDashboard(false);
  }, [params]);

  const handleNavigation = (index, name) => {
    scrollTo(0, 0);
    setActiveIndex(index);
    queryNavigate(pathnameRef.current, { tab: name.toLowerCase() });
  };

  return (
    <aside id="aside" className={isDashboard ? "active" : ""} ref={dashBoardRef}>
      <div id="dashboard">
        {/* Header */}
        <div className="dash-header">
          <div className="dash-brand">
            <div className="brand-icon">
              <Image src="/image/static/logo.svg" alt="logo" width={24} height={24} />
            </div>
            <span className="brand-name">CodeDev</span>
          </div>
          <button className="dash-upgrade">
            <FaCrown />
            <span>PRO</span>
          </button>
        </div>

        {/* Quick Search */}
        <div className="dash-search">
          <button className="search-trigger" onClick={() => queryNavigate(pathname, { search: true })}>
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
              {menuList.map((item, index) => (
                <li key={index}>
                  <button
                    className={`nav-link ${activeIndex === index ? 'active' : ''}`}
                    onClick={() => handleNavigation(index, item.name)}
                  >
                    <span className="link-icon">{item.icon}</span>
                    <span className="link-text">{item.name}</span>
                    {item.badge && (
                      <span className="link-badge">{item.badge}</span>
                    )}
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
        <div className={`dash-footer ${showOther ? 'expanded' : ''}`}>
          <button className="footer-toggle" onClick={() => setShowOther(!showOther)}>
            <span className="toggle-text">More Options</span>
            <HiChevronDown className={`toggle-arrow ${showOther ? 'rotated' : ''}`} />
          </button>

          {showOther && (
            <div className="footer-content">
              <button className="footer-link help">
                <span className="link-icon"><MdHelpCenter /></span>
                <span className="link-text">Help Center</span>
              </button>
              <button className="footer-link settings">
                <span className="link-icon"><IoSettingsSharp /></span>
                <span className="link-text">Settings</span>
              </button>
            </div>
          )}
        </div>

        {/* Mobile Close */}
        {isDashboard && (
          <button className="dash-close" onClick={() => handleDashboard(false)}>
            <IoClose />
          </button>
        )}
      </div>
    </aside>
  );
}
