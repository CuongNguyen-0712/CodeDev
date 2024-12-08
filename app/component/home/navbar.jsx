import { useRef, useState, useEffect } from "react";

import { FaListUl } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications, IoIosSend, IoMdReturnLeft } from "react-icons/io";
import { MdEmail, MdWindow, MdAddCircle } from "react-icons/md";
import { RiEmotionHappyLine, RiEmotionNormalLine, RiEmotionSadLine, RiEmotionUnhappyLine } from "react-icons/ri";

export default function Navbar({ onWidthDevice, handleOverlay, onMobile, sizeDevice, onReturn }) {

    const { width, height } = sizeDevice

    const ref = useRef(null);
    const refGroup = useRef(null);

    const [handleFeedback, setHandleFeedback] = useState(false);
    const [onGroup, setOnGroup] = useState(false);

    const refFocus = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
            setHandleFeedback(false);
        }

        if (refGroup.current && !refGroup.current.contains(e.target)) {
            setOnGroup(false);
        }
    }

    useEffect(() => {
        document.addEventListener("mousedown", refFocus);

        return () => {
            document.removeEventListener("mousedown", refFocus);
        }
    }, [])

    return (
        <nav id='navbar'>
            <div className="navbar-items">
                <div className="navbar-feature" style={{ width: onWidthDevice && "50%" }}>
                    {(onWidthDevice || onReturn) &&
                        <button className="menu-btn" onClick={handleOverlay || onReturn} style={{ background: onReturn && "var(--color_black)", color: onReturn && "#fff" }}>
                            {onReturn ? <IoMdReturnLeft style={{ fontWeight: '700' }} /> : <FaListUl />}
                        </button>
                    }
                    <div className="input-container">
                        <button>
                            <IoSearch />
                        </button>
                        {!onMobile &&
                            <input type="text" placeholder="Search..." />
                        }
                    </div>
                </div>
                <div className="navbar-links">
                    <button>
                        <MdAddCircle />
                        <span>Add</span>
                    </button>
                    {
                        onMobile ?
                            <>
                                <button style={{ background: "var(--color_black)", color: "#fff" }} onClick={() => setOnGroup(true)}>
                                    <MdWindow />
                                </button>
                            </>
                            :
                            <>
                                <button>
                                    <MdEmail />
                                </button>
                                <button>
                                    <IoMdNotifications />
                                </button>
                                <button onClick={() => setHandleFeedback(true)}>
                                    Feedback
                                </button>
                            </>
                    }
                    {
                        (width <= 425 && onMobile && onGroup) &&
                        <div className="group-links" style={{ width: `${width / 2}px` }} ref={refGroup}>
                            <button>
                                <MdEmail />
                                Mailbox
                            </button>
                            <button>
                                <IoMdNotifications />
                                Notifications
                            </button>
                            <button onClick={() => setHandleFeedback(true)}>
                                Feedback
                            </button>
                        </div>
                    }
                    {
                        (handleFeedback && !onMobile) &&
                        <form onSubmit={() => { }} id="feedback-form" ref={ref}>
                            <input type="text" placeholder="example@gamil.com" />
                            <textarea cols="30" rows="10" placeholder="Write something..."></textarea>
                            <div className="footer-feedback">
                                <ul className="react-rate">
                                    <li>
                                        <RiEmotionHappyLine />
                                    </li>
                                    <li>
                                        <RiEmotionNormalLine />
                                    </li>
                                    <li>
                                        <RiEmotionSadLine />
                                    </li>
                                    <li>
                                        <RiEmotionUnhappyLine />
                                    </li>
                                </ul>
                                <button type="submit">
                                    Send
                                    <IoIosSend />
                                </button>
                            </div>
                        </form>
                    }
                </div>
            </div>
        </nav>
    )
}