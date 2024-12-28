import { useRef, useState, useEffect } from "react";

import Form from 'next/form'

import axios from "axios";

import { FaListUl } from "react-icons/fa";
import { IoSearch } from "react-icons/io5";
import { IoMdNotifications, IoIosSend, IoMdReturnLeft } from "react-icons/io";
import { MdEmail, MdWindow, MdAddCircle, MdOutlineSync } from "react-icons/md";
import { RiEmotionHappyLine, RiEmotionNormalLine, RiEmotionSadLine, RiEmotionUnhappyLine } from "react-icons/ri";

export default function Navbar({ onIpad, onMobile, handleOverlay, sizeDevice, onReturn }) {

    const { width, height } = sizeDevice

    const [dataForm, setDataForm] = useState({
        title: '',
        feedback: '',
        emotion: '',
    });

    const [status, setStatus] = useState(false);
    const [message, setMessage] = useState('');

    const ref = useRef(null);
    const refGroup = useRef(null);

    const [handleFeedback, setHandleFeedback] = useState(false);
    const [onGroup, setOnGroup] = useState(false);

    const react_rate = [
        {
            icon: <RiEmotionHappyLine />,
            name: "happy",
            color: 'var(--color_blue)'
        },
        {
            icon: <RiEmotionNormalLine />,
            name: "normal",
            color: 'var(--color_green)'
        },
        {
            icon: <RiEmotionUnhappyLine />,
            name: "unhappy",
            color: 'var(--color_yellow)'
        },
        {
            icon: <RiEmotionSadLine />,
            name: "sad",
            color: 'var(--color_red)'
        }
    ]

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

    const handleGruop = () => {
        setHandleFeedback(true)
        setOnGroup(false)
    }


    const handleSubmit = async (e) => {
        e.preventDefault();
        setStatus(true)

        const { title, feedback, emotion } = dataForm;
        if (!title || !feedback) {
            setMessage("Your title or feedback is invalid");
            setTimeout(() => {
                setStatus(false);
            }, 500)
            return;
        }

        if (!emotion) {
            setMessage("Your emotion is invalid");
            setTimeout(() => {
                setStatus(false);
            }, 500)
            return;
        }

        setMessage("Waiting... Your feedback is being sent");

        try {
            const req = await axios.post("/actions/postFeedback", { title, feedback, emotion });

            if (req.status === 200) {
                setDataForm({ title: "", feedback: "", emotion: '' });
                setMessage("Feedback sent successfully!");
            } else if (req.status === 500) {
                setMessage("Failed to send feedback, please try again!");
            }
        } catch (error) {
            setMessage("An error occurred, please try again!");
            console.error(error);
        } finally {
            setTimeout(() => {
                setStatus(false);
            }, 500)
        }
    };

    return (
        <nav id='navbar'>
            <div className="navbar-items">
                <div className="navbar-feature" style={{ width: onIpad && "50%", width: onMobile && 'max-content' }}>
                    {(width <= 768 || onReturn) &&
                        <button className="menu-btn" onClick={handleOverlay || onReturn} style={{ background: onReturn && "var(--color_black)", color: onReturn && "#fff" }}>
                            {onReturn ? <IoMdReturnLeft style={{ fontWeight: '700' }} /> : <FaListUl />}
                        </button>
                    }
                    <button className="search">
                        <span>
                            <IoSearch />
                        </span>
                        {width > 500 &&
                            <span>
                                Search
                            </span>
                        }
                    </button>
                </div>
                <div className="navbar-links">
                    <button>
                        <MdAddCircle />
                        <span>Todo</span>
                    </button>
                    {
                        onMobile ?
                            <>
                                <button style={{ background: "var(--color_black)", color: "#fff" }} onClick={() => setOnGroup(true)}>
                                    <MdWindow />
                                </button>
                                <div className="group-links" style={{ width: `${width}px`, top: `${onGroup ? (height - 50) : height}px` }} ref={refGroup}>
                                    <button>
                                        <MdEmail />
                                    </button>
                                    <button>
                                        <IoMdNotifications />
                                    </button>
                                    <button onClick={() => handleGruop()}>
                                        Feedback
                                    </button>
                                </div>
                            </>
                            :
                            <>
                                <button>
                                    <MdEmail />
                                </button>
                                <button>
                                    <IoMdNotifications />
                                </button>
                                <button onClick={() => setHandleFeedback(true)} >
                                    Feedback
                                </button>
                            </>
                    }
                    <Form onSubmit={handleSubmit} id="feedback-form" ref={ref} style={{ width: onMobile ? `${width}px` : `${width > 1000 ? width / 3 : width / 2}px`, height: onMobile ? `${height / 2}px` : `${height / 3}px`, right: onMobile && "-20px", top: onMobile && `${handleFeedback ? height / 2 : height}px`, borderRadius: onMobile && "10px 10px 0 0", outline: onMobile && "none", transform: !onMobile && (handleFeedback ? 'scale(1)' : 'scale(0)'), transformOrigin: !onMobile && 'top right' }}>
                        <input type="text" id="title" name="title" value={dataForm.title} onChange={(e) => setDataForm({ ...dataForm, title: e.target.value })} disabled={status} placeholder="Title for your feedback" />
                        <textarea id="feedback" name="feebback" value={dataForm.feedback} onChange={(e) => setDataForm({ ...dataForm, feedback: e.target.value })} disabled={status} placeholder="Write something..."></textarea>
                        <div className="footer-feedback">
                            <ul className="react-rate">
                                {react_rate.map((item, index) => (
                                    <li
                                        key={index}
                                        style={{
                                            color: item.name === dataForm.emotion ? item.color : undefined,
                                            display:
                                                item.name !== dataForm.emotion && dataForm.emotion !== '' ? 'none' : undefined,
                                        }}
                                        onClick={() =>
                                            setDataForm({ ...dataForm, emotion: item.name })
                                        }
                                    >
                                        {item.icon}
                                        {dataForm.emotion === item.name && (
                                            <>
                                                <span style={{ color: item.color }}>
                                                    {dataForm.emotion}
                                                </span>
                                                <button
                                                    id="change-emotion"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setDataForm({ ...dataForm, emotion: '' });
                                                    }}
                                                >
                                                    <MdOutlineSync />
                                                </button>
                                            </>
                                        )}
                                    </li>
                                ))}
                            </ul>

                            <button type="submit" disabled={status}>
                                Send
                                <IoIosSend />
                            </button>
                        </div>
                        {status &&
                            <div className="handle">
                                {message}
                            </div>
                        }
                    </Form>
                </div>
            </div>
        </nav>
    )
}