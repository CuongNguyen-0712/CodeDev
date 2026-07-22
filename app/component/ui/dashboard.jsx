import { useState, useRef, useEffect } from "react";

import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";

import { LoadingContent } from "./loading";

import { useAuth } from "@/app/contexts/authContext";

import { useRouterActions } from "@/app/router/useRouterActions";

import { FaHome, FaChevronLeft, FaBookOpen, FaRegQuestionCircle, FaCode } from "react-icons/fa";
import { IoSettingsSharp } from "react-icons/io5";
import { MdHelpCenter, MdOutlineFeedback } from "react-icons/md";
import { HiChevronDown } from "react-icons/hi2";
import { RiRoadMapFill } from "react-icons/ri";
import { MdQuestionAnswer, MdConnectWithoutContact } from "react-icons/md";
import { IoMdContacts } from "react-icons/io";

export default function Dashboard({ isDashboard, handleDashboard }) {
  const { session, status } = useAuth();

  const dashBoardRef = useRef(null);

  const pathname = usePathname();
  const { navigate } = useRouterActions();

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
        { name: 'Roadmap', value: 'roadmap', icon: <RiRoadMapFill />, color: 'var(--teal-100)', access: 'public' },
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
        { name: 'About', value: 'about', icon: <FaRegQuestionCircle />, color: 'var(--pink-500)', access: 'public' },
      ]
    }
  ];

  const menus = session ? navigationList : navigationList.map(section => ({
    ...section,
    items: section.items.filter(item => item.access === 'public')
  }));

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
          {status === 'loading' ?
            <LoadingContent scale={0.5} />
            :
            menus.map((item, index) => (
              <div key={index} className="nav-section">
                <span className="nav-title">{item.title}</span>
                <ul className="nav-menu">
                  {
                    item.items?.map((child, idx) => (
                      <li key={idx}>
                        <button
                          className={`nav-link ${pathname.includes(child.value) ? 'active' : ''}`}
                          onClick={() => handleRouter(child.value)}
                        >
                          <span className="link-icon" style={{ color: child.color }}>{child.icon}</span>
                          <span className="link-text">{child.name}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
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
