import { useState, useEffect } from "react"

import Image from "next/image";
import RegisterCourseService from "@/app/services/postService/registerCourseService";
import CourseService from "@/app/services/getService/courseService";

import Navbar from "../home/navbar";
import Feedback from "../home/feedback";
import Manage from "../home/manage";

import { LoadingContent, LoadingRedirect } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import { useQuery } from "@/app/router/router";
import { useSearchParams } from "next/navigation";

import { FaStar, FaCircleNotch, FaRegCheckCircle, FaRegTimesCircle } from "react-icons/fa";
import { IoFilter } from "react-icons/io5";
import { FaRightLong } from "react-icons/fa6";

export default function Course() {
    const queryNavigate = useQuery();
    const params = useSearchParams();

    const [state, setState] = useState({
        data: [],
        error: null,
        pending: true,
        handling: false,
        idHandle: null,
        message: null,
        redirect: false,
        overlay: false
    });

    const fetchData = async () => {
        try {
            const res = await CourseService('CD01');
            if (res.status == 200) {
                setState((prev) => ({ ...prev, data: res.data, pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message || "Something is wrong" }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || "Something is wrong" }, pending: false }))
            throw new Error(err);
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const handleRequest = async (id, isCost) => {

        const updateState = {
            ...state,
            handling: true,
            idHandle: id
        }

        setState(updateState)

        try {
            const res = await RegisterCourseService({ idStudent: 'CD01', idCourse: id });

            if (res.status === 200) {
                setState(prev => ({ ...prev, message: { status: res.status, data: res.message, handling: false, idHandle: null } }))
                await fetchData();
            }
            else {
                setState(prev => ({ ...prev, message: { status: res.status, data: res.message, handling: false } }))
            }
        }
        catch (err) {
            setState(prev => ({ ...prev, message: { status: 500, data: err.message, handling: false } }))
            throw new Error(err)
        }
    }

    useEffect(() => {
        document.body.style.overflow = (params.get('manage') || params.get('feedback')) ? 'hidden' : 'auto';
        setState((prev) => ({ ...prev, overlay: (params.get('manage') || params.get('feedback')) }))
    }, [params])

    const handleRedirect = () => {
        setState((prev) => ({ ...prev, redirect: true }))
        queryNavigate('/home', { target: 1, name: 'Course' })
    }

    return (
        <main id="home" className={state.overlay ? 'overlay' : ''}>
            {state.redirect ?
                <LoadingRedirect />
                :
                <>
                    <div id="header">
                        <Navbar onHome={true} handleOverlay={() => setState(prev => ({ ...prev, overlay: !prev.overlay }))} />
                    </div>
                    <div id="container">
                        {
                            state.pending ?
                                <LoadingContent />
                                :
                                <div id='course'>
                                    <div className="heading-marketplace">
                                        <div className="input-search">
                                            <input type="text" placeholder="Search course" />
                                            <button className="filter">
                                                <IoFilter />
                                            </button>
                                        </div>
                                        <div className="handle-course">
                                            <button onClick={handleRedirect} id="myCourse-btn">
                                                <h4>
                                                    Back to my course
                                                </h4>
                                                <FaRightLong />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="course-container">
                                        {state.error ?
                                            <ErrorReload data={state.error} refetch={fetchData} />
                                            :
                                            state.data && state.data.length > 0 ?
                                                state.data.map((item) => (
                                                    <div className="item" key={item.id}>
                                                        <div className="heading">
                                                            <Image src={item.image} alt='course-image' width={65} height={65} />
                                                            <h3>{item.title}</h3>
                                                            <span className="rating">
                                                                {item.rating}
                                                                <FaStar className="star" />
                                                            </span>
                                                            <div className="concept">
                                                                <p>{item.concept}</p>
                                                            </div>
                                                        </div>
                                                        <div className="content-item">
                                                            <div className="info">
                                                                <h5>{item.level}</h5>
                                                            </div>
                                                            <div className="info">
                                                                <p>{item.lesson} lessons - {item.duration} hours</p>
                                                            </div>
                                                            <div className="info">
                                                                <p>{item.description}</p>
                                                            </div>
                                                            <div className="info">
                                                                <span>Instructor:</span>
                                                                <p>{item.instructor}</p>
                                                            </div>
                                                            <div className="info">
                                                                <span>Subject:</span>
                                                                <p>{item.subject}</p>
                                                            </div>
                                                            <div className="info">
                                                                <span>Student:</span>
                                                                <p>{item.students}</p>
                                                            </div>
                                                        </div>
                                                        <div className="footer">
                                                            <button onClick={() => handleRequest(item.id, item.cost !== 'free')} style={item.cost === 'free' ? { backgroundColor: 'var(--color_blue)' } : { backgroundColor: 'var(--color_black)' }} disabled={state.pending}>
                                                                {state.idHandle === item.id ?
                                                                    <FaCircleNotch className="handling" />
                                                                    :
                                                                    item.cost === 'free' ? 'Learn' : item.cost
                                                                }
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                                :
                                                <p>No course found, please wait for the next update</p>
                                        }
                                    </div>
                                </div>
                        }
                    </div>
                    {
                        params.get('feedback') &&
                        <div className="feedback-container">
                            <Feedback />
                        </div>
                    }
                    {
                        params.get('manage') &&
                        <div className="manage-container">
                            <Manage redirect={() => setState(prev => ({ ...prev, overlay: false, redirect: true }))} />
                        </div>
                    }
                </>
            }
        </main >
    )
}