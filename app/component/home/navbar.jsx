"use client";
import { useRef, useState, useEffect } from "react";

import { useSize } from "@/app/contexts/sizeContext";
import Feedback from "@/app/lib/feedback";

import { FaListUl } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { FaLeftLong } from "react-icons/fa6";
import { IoMdNotifications } from "react-icons/io";
import { MdEmail, MdWindow, MdAddCircle } from "react-icons/md";

export default function Navbar({ onReturn, handleMenu }) {
  const { size } = useSize();
  const { height, width } = size;

  const refGroup = useRef(null);

  const [onGroup, setOnGroup] = useState(false);
  const [onFeedback, setOnFeedback] = useState(false);

  const refFocus = (e) => {
    if (refGroup.current && !refGroup.current.contains(e.target)) {
      setOnGroup(false);
    }
  };

  useEffect(() => {
    document.addEventListener("mousedown", refFocus);

    return () => {
      document.removeEventListener("mousedown", refFocus);
    };
  }, []);

  const showFeedbackForm = () => {
    setOnFeedback(true);
    setOnGroup(false);
    document.body.style.overflow = "hidden";
  };

  const hiddenFeedbackForm = () => {
    setOnFeedback(false);
    document.body.style.overflow = "unset";
  };

  return (
    <>
      <nav id="navbar">
        <div className="navbar-items">
          <div className="navbar-feature">
            <button
              id="menu-btn"
              onClick={handleMenu || onReturn}
              style={{
                background: onReturn && "var(--color_black)",
                color: onReturn && "#fff",
              }}
            >
              {onReturn ? (
                <FaLeftLong />
              ) : (
                <FaListUl />
              )}
            </button>
            <div id="app-name">
              <img
                src="/image/logo.svg"
                height={25}
                width={25}
                alt=""
              />
              <h2>CodeDev</h2>
            </div>
          </div>
          {width >= 600 && (
            <button className="search">
              <span>
                <IoSearch />
              </span>
              <span>Search</span>
            </button>
          )}
          <div className="navbar-links">
            <button id="todo">
              <MdAddCircle />
              {width > 900 && <span>Todo</span>}
            </button>
            {width < 768 ? (
              <>
                <button id="window-menu" onClick={() => setOnGroup(!onGroup)}>
                  <MdWindow />
                </button>
                <div
                  className="group-links"
                  style={{
                    width: `${width}px`,
                    top: `${onGroup ? height - 50 : height}px`,
                  }}
                  ref={refGroup}
                >
                  <button id="mail">
                    <MdEmail />
                  </button>
                  <button id="noti">
                    <IoMdNotifications />
                  </button>
                  <button id="feedback" onClick={() => showFeedbackForm()}>
                    Feedback
                  </button>
                </div>
              </>
            ) : (
              <>
                <button id="mail">
                  <MdEmail />
                </button>
                <button id="noti">
                  <IoMdNotifications />
                </button>
                <button id="feedback-btn" onClick={() => showFeedbackForm()}>
                  Feedback
                </button>
              </>
            )}
          </div>
        </div>
      </nav>
      {onFeedback ?
        <div className="feedback-overlay">
          <Feedback handleFeedback={() => hiddenFeedbackForm()} />
        </div>
        :
        null
      }
    </>
  );
}
