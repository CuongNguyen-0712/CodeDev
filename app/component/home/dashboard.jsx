import { useState, useRef, useEffect } from "react";

import { useSearchParams, usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { LoadingContent } from "../ui/loading";

import { useAuth } from "@/app/contexts/authContext";

import { useRouterActions } from "@/app/router/useRouterActions";
import { useQueryParams } from "@/app/router/useQueryParams";

import { FaUsers, FaChevronLeft, FaTasks, FaBookOpen, FaRegQuestionCircle } from "react-icons/fa";
import { FaCode } from "react-icons/fa6";
import { IoSettingsSharp } from "react-icons/io5";
import {
  MdHelpCenter,
  MdSpaceDashboard,
  MdOutlineFeedback,
} from "react-icons/md";
import { HiChevronDown } from "react-icons/hi2";
import { RiRoadMapFill } from "react-icons/ri";
import { MdQuestionAnswer } from "react-icons/md";

export default function Dashboard({ isDashboard, handleDashboard }) {
  const { session, status } = useAuth();

  const dashBoardRef = useRef(null);

  const updateQuery = useQueryParams();
  const pathname = usePathname();
  const params = useSearchParams();
  const { navigate } = useRouterActions();

  const [activeIndex, setActiveIndex] = useState(0);
  const [showOther, setShowOther] = useState(false);

  const menuList = [
    { name: "Overview", path: 'home', value: 'overview', icon: <MdSpaceDashboard />, color: 'var(--color_primary)' },
    { name: "Learning", path: 'home', value: 'learning', icon: <FaCode />, color: 'var(--color_red)' },
    { name: "Task", path: 'home', value: 'task', icon: <FaTasks />, color: 'var(--color_blue)' },
    { name: "Connection", path: 'home', value: 'connection', icon: <FaUsers />, color: 'var(--color_green)' },
  ];

  const navigationList = [
    { name: 'Course', value: 'course', icon: <FaBookOpen />, color: 'var(--color_purple)' },
    { name: 'Roadmap', value: 'roadmap', icon: <RiRoadMapFill />, color: 'var(--color_cyan)' },
    { name: 'Blog', value: 'blog', icon: <MdQuestionAnswer />, color: 'var(--color_teal)' },
    { name: 'About', value: 'about', icon: <FaRegQuestionCircle />, color: 'var(--color_pink)' },
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
    handleDashboard(false);
  }, [params]);

  const handleQuery = (index, path, value) => {
    setActiveIndex(index);
    scrollTo(0, 0);
    navigate({ path: path, query: { tab: value } });
  };

  const handleRouter = (value) => {
    handleDashboard(false);
    scrollTo(0, 0);
    navigate({ path: value });
  }

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

        {/* Navigation */}
        <nav className="dash-nav">
          {
            session &&
            <div className="nav-section home">
              <span className="nav-title">Home</span>
              <ul className="nav-menu">
                {status === 'loading' ?
                  <LoadingContent scale={0.5} />
                  :
                  menuList.map((item, index) => (
                    <li key={index}>
                      <button
                        className={`nav-link ${activeIndex === index ? 'active' : ''}`}
                        onClick={() => handleQuery(index, item.path, item.value)}
                      >
                        <span className="link-icon" style={{ color: item.color }}>{item.icon}</span>
                        <span className="link-text">{item.name}</span>
                      </button>
                    </li>
                  ))}
              </ul>
            </div>
          }
          <div className="nav-section navigation">
            <span className="nav-title">Navigation</span>
            <ul className="nav-menu">
              {status === 'loading' ?
                <LoadingContent scale={0.5} />
                :
                navigationList.map((item, index) => (
                  <li key={index}>
                    <button
                      className={`nav-link ${pathname.includes(item.value) ? 'active' : ''}`}
                      onClick={() => handleRouter(item.value)}
                    >
                      <span className="link-icon" style={{ color: item.color }}>{item.icon}</span>
                      <span className="link-text">{item.name}</span>
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </nav>

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
                <button className="footer-link feedback" onClick={() => updateQuery({ modal: 'feedback' })}>
                  <span className="link-icon"><MdOutlineFeedback /></span>
                  <span className="link-text">Send Feedback</span>
                </button>
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
