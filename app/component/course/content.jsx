import { useState, useEffect, useTransition, startTransition } from "react"

import Image from "next/image";
import RegisterCourseService from "@/app/services/postService/registerCourseService";
import GetCourseService from "@/app/services/getService/courseService";
import { useQuery } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";

import { FaStar, FaCircleNotch, FaArrowRight } from "react-icons/fa";
import { IoFilter } from "react-icons/io5";

export default function CourseContent({ redirect }) {
    const queryNavigate = useQuery();

    const [state, setState] = useState({
        data: [],
        pending: true,
        idHandle: null,
        handling: false,
        error: null,
        message: null,
    })

    const fetchData = async () => {
        try {
            const res = await GetCourseService();
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

        if (!isCost) {
            try {
                const res = await RegisterCourseService(id);

                if (res.status === 200) {
                    await fetchData();
                    startTransition(() => {
                        setState(prev => ({ ...prev, message: { status: res.status, data: res.message }, handling: false, idHandle: null }))
                    })
                }
                else {
                    setState(prev => ({ ...prev, message: { status: res.status, data: res.message }, handling: false, idHandle: false }))
                }
            }
            catch (err) {
                setState(prev => ({ ...prev, message: { status: 500, data: err.message }, handling: false, idHandle: false }))
                throw new Error(err)
            }
        }
    }

    const handleRedirect = () => {
        queryNavigate('/home', { name: 'course' });
        redirect();
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }))
        fetchData();
    }

    return (
        <div id='course'>
            <div className="heading-marketplace">
                <div className="input-search">
                    <input type="text" placeholder="Search course" />
                    <button className="filter">
                        <IoFilter />
                    </button>
                </div>
                <div className="handle_back">
                    <button onClick={handleRedirect} className="back_btn">
                        <h4>
                            Back
                        </h4>
                        <FaArrowRight />
                    </button>
                </div>
            </div>
            <div className="course-container">
                {
                    state.pending ?
                        <LoadingContent />
                        :
                        state.error ?
                            <ErrorReload data={state.error} refetch={refetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map((item) => (
                                    <div className="item" key={item.id} id={item.id}>
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
                                                <p>{item.description}</p>
                                            </div>
                                            <div className="info">
                                                <span>Subject:</span>
                                                <p>{item.subject}</p>
                                            </div>
                                            <div className="info">
                                                <span>Instructor:</span>
                                                <p>{item.instructor}</p>
                                            </div>
                                        </div>
                                        <div className="footer">
                                            <button
                                                onClick={() => handleRequest(item.id, item.cost !== 'free')}
                                                style={{
                                                    backgroundColor: item.cost === 'free' ? 'var(--color_blue)' : 'var(--color_black)',
                                                    ...(state.handling && { cursor: 'not-allowed' })
                                                }}
                                                disabled={state.handling}
                                            >
                                                {state.idHandle === item.id ?
                                                    <FaCircleNotch className="handling" style={{ fontSize: '20px' }} />
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
    )
}