'use client'
import { useState, useReducer, useEffect, useRef } from "react"

import { LoadingContent, LoadingRedirect } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import GetStateCourseService from "@/app/services/getService/stateCourseService";
import GetCommentCourseService from "@/app/services/getService/commentCourseService";
import GetLessonCourseService from "@/app/services/getService/lessonCourse";
import PostCommentCourseService from "@/app/services/postService/createCommentCourseService";

import { useRouterActions } from "@/app/router/router";

import { uniqWith } from "lodash";

import AlertPush from "../../ui/alert";

import Form from "next/form";

import { FaArrowLeft, FaStar, FaCheckCircle, FaAngleDoubleUp, FaAngleDoubleDown } from "react-icons/fa";
import { BiDetail } from "react-icons/bi";
import { MdPlayLesson } from "react-icons/md";
import { LuAlarmClock } from "react-icons/lu";
import { PiStudent } from "react-icons/pi";
import { IoSend } from "react-icons/io5";

const CommentItem = ({ data }) => {
    const [state, setState] = useState({
        upvotes: Number(data.upvotes),
        downvotes: Number(data.downvotes)
    })

    const [flag, setFlag] = useState({
        upvotes: false,
        downvotes: false,
    })

    const formatDate = (str) => {
        const d = new Date(str);

        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const year = d.getFullYear();
        const hour = String(d.getHours()).padStart(2, "0");
        const minute = String(d.getMinutes()).padStart(2, "0");

        return `${day}/${month}/${year} ${hour}:${minute}`;
    };

    const handleVoting = (e) => {
        const { name } = e.target;
        const keyVote = Object.entries(flag)
            .find(([_, value]) => value === true)?.[0] || null;

        if (keyVote !== name) {
            setState((prev) => ({
                ...prev,
                [name]: prev[name] + 1,
                [keyVote]: prev[keyVote] - 1
            }))

            setFlag((prev) =>
                Object.fromEntries(
                    Object.entries(prev).map(([key, _]) => [
                        key,
                        key === name ? true : false
                    ])
                )
            )
        }
        else {
            setState((prev) => ({
                ...prev,
                [name]: flag[name] ? prev[name] - 1 : prev[name] + 1
            }))

            setFlag((prev) => ({
                ...prev,
                [name]: !prev[name]
            }))
        }
    }

    return (
        <div className="comment_item">
            <div className="comment_info">
                <img
                    className="comment_img"
                    src={data.avatar}
                    alt="avatar"
                    height={40}
                    width={40}
                />
                <div className="info">
                    <h4>{data.username}</h4>
                    <p>{formatDate(data.created_at)}</p>
                </div>
            </div>
            <div className="comment">
                <p>
                    {data.comment}
                </p>
                <div className="comment_footer">
                    <button
                        name="upvotes"
                        onClick={handleVoting}
                        className={`${flag.upvotes ? 'flag' : ''}`}
                    >
                        <FaAngleDoubleUp
                            fontSize={18}
                            color={'var(--color_green_dark)'}
                        />
                        {state.upvotes}
                    </button>
                    <button
                        name="downvotes"
                        onClick={handleVoting}
                        className={`${flag.downvotes ? 'flag' : ''}`}
                    >
                        <FaAngleDoubleDown
                            fontSize={18}
                            color={'var(--color_red_dark)'}
                        />
                        {state.downvotes}
                    </button>
                </div>
            </div>
        </div>
    )
}

export default function PreviewCourse({ params } = {}) {
    const { navigateBack } = useRouterActions()
    const scrollRef = useRef(null)

    const colorLevelMap = {
        'Beginner': {
            color: 'var(--color_green)',
        },
        'Intermediate': {
            color: 'var(--color_blue)',
        },
        'Advanced': {
            color: 'var(--color_orange)',
        },
        'Expert': {
            color: 'var(--color_purple)',
        },
        'Master': {
            color: 'var(--color_red_dark)',
        }
    }

    const initialState = {
        state: {
            data: null,
            error: null,
            pending: false,
        },
        lesson: {
            data: null,
            error: null,
            pending: false,
        },
        comment: {
            data: null,
            error: null,
            pending: false,
        },
    };

    const ACTIONS = {
        START: 'START',
        SUCCESS: 'SUCCESS',
        ERROR: 'ERROR',
        UPDATE: 'UPDATE',
        END: 'END'
    }

    function reducer(state, action) {
        const { key, payload } = action;

        switch (action.type) {
            case ACTIONS.START:
                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        pending: true,
                        error: null,
                    },
                };

            case ACTIONS.SUCCESS:
                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        data: payload,
                        pending: false,
                        error: null,
                    },
                };

            case ACTIONS.ERROR:
                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        pending: false,
                        error: payload,
                    },
                };

            case ACTIONS.UPDATE:
                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        data: uniqWith([...state[key].data ?? [], ...payload ?? []], (a, b) => a.id === b.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
                    },
                };

            case ACTIONS.END:
                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        pending: false
                    },
                }

            default:
                return state;
        }
    }

    const [state, dispatch] = useReducer(reducer, initialState)

    const [comment, setComment] = useState({
        content: '',
        rating: null,
    })

    const [handling, setHandling] = useState(false)
    const [error, setError] = useState(null)
    const [pending, setPending] = useState(true)
    const [alert, setAlert] = useState(null)

    const [apiQueue, setApiQueue] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)

    const [load, setLoad] = useState({
        limit: 20,
        hasMore: true,
        handling: false
    })

    useEffect(() => {
        if (isProcessing || apiQueue.length === 0) return;

        const run = async () => {
            setIsProcessing(true);

            const task = apiQueue[0];

            await task.execute();

            setApiQueue(prev => prev.slice(1));
            setIsProcessing(false);
        };

        run();
    }, [apiQueue, isProcessing]);

    const scrollToTop = () => {
        scrollRef.current?.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    }

    const fetchState = async () => {
        try {
            const course_id = params.id
            const res = await GetStateCourseService({ course_id })
            if (res.status === 200) {
                dispatch({
                    type: ACTIONS.SUCCESS,
                    key: 'state',
                    payload: res.data
                })
            }
            else {
                dispatch({
                    type: ACTIONS.ERROR,
                    key: 'state',
                    payload: {
                        status: res.status,
                        message: res.message
                    }
                })
            }
        }
        catch (err) {
            dispatch({
                type: ACTIONS.ERROR,
                key: 'state',
                payload: {
                    status: 500,
                    message: 'External server error'
                }
            })
        }
        finally {
            setPending(false)
        }
    }

    const fetchLesson = async () => {
        try {
            const course_id = params.id
            const res = await GetLessonCourseService({ course_id })
            if (res.status === 200) {
                const payload = res.data.reduce((acc, { module_id, title, ...rest }) => {
                    if (!acc[module_id]) {
                        acc[module_id] = {
                            id: module_id,
                            title: title,
                            lessons: []
                        }
                    }
                    acc[module_id].lessons.push(rest)

                    return acc
                }, {})


                dispatch({
                    type: ACTIONS.SUCCESS,
                    key: 'lesson',
                    payload: payload
                })
            }
            else {
                dispatch({
                    type: ACTIONS.ERROR,
                    key: 'lesson',
                    payload: {
                        status: res.status,
                        message: res.message
                    }
                })
            }
        }
        catch (err) {
            dispatch({
                type: ACTIONS.ERROR,
                key: 'lesson',
                payload: {
                    status: 500,
                    message: 'External server error'
                }
            })
        }
        finally {
            setPending(false)
        }
    }

    const fetchComment = () => {
        if (load.handling || !load.hasMore) return;

        setApiQueue((prev) => [
            ...prev,
            {
                type: 'fetch',
                execute: async () => {

                    try {
                        const course_id = params.id
                        const adjustedOffset = state.comment.data?.length || 0
                        const res = await GetCommentCourseService({ course_id: course_id, offset: adjustedOffset, limit: load.limit.toString() })
                        if (res.status === 200) {
                            setLoad((prev) => ({
                                ...prev,
                                hasMore: res.data.length >= prev.limit
                            }))
                            if (Array.isArray(state.comment.data) && state.comment.data.length > 0) {
                                dispatch({
                                    type: ACTIONS.UPDATE,
                                    key: 'comment',
                                    payload: res.data
                                })
                            } else {
                                dispatch({
                                    type: ACTIONS.SUCCESS,
                                    key: 'comment',
                                    payload: res.data
                                })
                            }
                        }
                        else {
                            dispatch({
                                type: ACTIONS.ERROR,
                                key: 'comment',
                                payload: {
                                    status: res.status,
                                    message: res.message
                                }
                            })
                        }
                    }
                    catch (err) {
                        dispatch({
                            type: ACTIONS.ERROR,
                            key: 'comment',
                            payload: {
                                status: 500,
                                message: 'External server error'
                            }
                        })
                    }
                    finally {
                        setPending(false)
                        setLoad((prev) => ({
                            ...prev,
                            handling: false
                        }))
                    }
                }
            }
        ])
    }

    const updateComment = () => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'update',
                execute: async () => {

                    try {
                        const course_id = params.id
                        const res = await GetCommentCourseService({ course_id: course_id, offset: 0, limit: load.limit.toString() })
                        if (res.status === 200) {
                            dispatch({
                                type: ACTIONS.UPDATE,
                                key: 'comment',
                                payload: res.data
                            })
                            scrollToTop()
                        }
                        else {
                            dispatch({
                                type: ACTIONS.ERROR,
                                key: 'comment',
                                payload: {
                                    status: res.status,
                                    message: res.message
                                }
                            })
                        }
                    }
                    catch (err) {
                        dispatch({
                            type: ACTIONS.ERROR,
                            key: 'comment',
                            payload: {
                                status: 500,
                                message: 'External server error'
                            }
                        })
                    }
                }
            }
        ])
    }

    const handleLoadComment = () => {
        if (!load.hasMore || load.handling) return;

        setLoad(prev => ({ ...prev, handling: true }));
        fetchComment();
    };

    const fetchData = () => {
        setPending(true)
        setError(null)

        if (!params || !params.id) {
            setError({
                status: 400,
                message: 'Missing something, try again!'
            })
            setPending(false)
            return
        }

        dispatch({ type: ACTIONS.START, key: 'state' })
        dispatch({ type: ACTIONS.START, key: 'lesson' })
        dispatch({ type: ACTIONS.START, key: 'comment' })

        fetchState()
        fetchLesson()
        fetchComment()
    }

    const refetchData = (key) => {
        dispatch({ type: ACTIONS.START, key: key })

        switch (key) {
            case 'state':
                fetchState()
                break
            case 'lesson':
                fetchLesson()
                break
            case 'comment':
                fetchComment()
                break
            default:
                return
        }
    }

    const submitComment = async (e) => {
        e.preventDefault();

        setHandling(true)

        if (comment.content.trim().length === 0 || comment.content === '') {
            setAlert({
                status: 404,
                message: 'No comment, please throw your new!'
            })
            setHandling(false)
            return;
        }

        try {
            const courseId = params.id
            const res = await PostCommentCourseService({ comment: comment.content, courseId: courseId })

            if (res.status === 200) {
                setComment((prev) => ({
                    ...prev,
                    content: ''
                }))
                updateComment({ course_id: courseId })
            }
            else {
                setAlert({
                    status: res.status,
                    message: res.message
                })
            }
        }
        catch (err) {
            setAlert({
                status: err.status || 500,
                message: 'External server error'
            })
        }
        finally {
            setHandling(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    useEffect(() => {
        setAlert(null)
    }, [alert])

    return (
        <section id="course_preview">
            <div className="header_preview">
                <button
                    type="button"
                    id="preview_back_btn"
                    onClick={() => navigateBack()}
                >
                    <FaArrowLeft fontSize={16} />
                </button>
            </div>
            {
                pending ?
                    <LoadingContent />
                    :
                    error ?
                        <ErrorReload data={error} refetch={fetchData} />
                        :
                        <div className="body_preview">
                            <div className="preview_container">
                                {
                                    state.state.pending ?
                                        <LoadingContent />
                                        :
                                        state.state.error ?
                                            <ErrorReload
                                                data={state.state.error || { status: 500, message: "Something is wrong" }}
                                                refetch={refetchData('state')}
                                            />
                                            :
                                            state.state.data ?
                                                <>
                                                    <div className="content_preview">
                                                        <div className="top_preview">
                                                            <img
                                                                src={state.state.data.image || '/image/static/logo.svg'}
                                                                alt="course_logo"
                                                                height={50}
                                                                width={50}
                                                            />
                                                            <h2>{state.state.data.title}</h2>
                                                            <span
                                                                style={{
                                                                    color: colorLevelMap[state.state.data.level].color,
                                                                }}
                                                            >{state.state.data.level}
                                                            </span>
                                                            <span style={{
                                                                color: 'var(--color_black)'
                                                            }}>
                                                                {state.state.data.rating}
                                                                <FaStar color={'var(--color_orange)'}
                                                                />
                                                            </span>
                                                        </div>
                                                        <p>
                                                            {state.state.data.concept}
                                                        </p>
                                                    </div>
                                                    <div className="beside_preview">
                                                        <p>
                                                            <BiDetail fontSize={22} />
                                                            {state.state.data.description}
                                                            <span>
                                                                <FaCheckCircle
                                                                    color={"var(--color_blue)"}
                                                                />
                                                                Instructor by <b>{state.state.data.instructor}</b>
                                                            </span>
                                                        </p>
                                                        <div className="beside_items">
                                                            <button>
                                                                <MdPlayLesson
                                                                    fontSize={20}
                                                                    color={'var(--color_green)'}
                                                                />
                                                                <span>
                                                                    Lessons:
                                                                </span>
                                                                {state.state.data.lesson}
                                                            </button>
                                                            <button>
                                                                <LuAlarmClock
                                                                    fontSize={20}
                                                                    color={'var(--color_orange)'}
                                                                />
                                                                <span>
                                                                    Hours:
                                                                </span>
                                                                {state.state.data.duration}
                                                            </button>
                                                            <button>
                                                                <PiStudent
                                                                    fontSize={20}
                                                                    color={'var(--color_blue)'}
                                                                />
                                                                <span>
                                                                    Students:
                                                                </span>
                                                                {state.state.data.students}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </>
                                                :
                                                <p>Something is wrong, try again!</p>
                                }
                                {
                                    state.lesson.pending ?
                                        <LoadingContent />
                                        :
                                        state.lesson.error ?
                                            <ErrorReload
                                                data={state.lesson.error || { status: 500, message: "Something is wrong" }}
                                                refetch={refetchData('lesson')}
                                            />
                                            :
                                            (Object.values(state.lesson.data).length > 0 || Object.values(state.lesson.data).includes(undefined)) ?
                                                <div className="base_lesson">
                                                    {
                                                        Object.values(state.lesson.data).map((item, index) => (
                                                            <div
                                                                key={item.id}
                                                                className="module_item"
                                                            >
                                                                <button className="module_header">
                                                                    <h4>Chapter {index + 1}</h4>
                                                                    <p>{item.title}</p>
                                                                </button>
                                                                <button className="module_container">
                                                                    {
                                                                        item.lessons.map((child, idx) => (
                                                                            <div
                                                                                key={child.lesson_id}
                                                                                className="module_lesson"
                                                                            >
                                                                                <p>{index + 1}.{idx + 1} - {child.name}</p>
                                                                                <span>{child.type}</span>
                                                                            </div>
                                                                        ))
                                                                    }
                                                                </button>
                                                            </div>
                                                        ))
                                                    }
                                                </div>
                                                :
                                                <p className="no_data">
                                                    Something is wrong, try again !
                                                </p>
                                }
                            </div>
                            <div id="comment">
                                <div className="comment_course" ref={scrollRef}>
                                    {
                                        state.comment.pending ?
                                            <LoadingContent />
                                            :
                                            state.comment.error ?
                                                <ErrorReload
                                                    data={state.comment.error}
                                                    refetch={refetchData('comment')}
                                                />
                                                :
                                                (state.comment.data && state.comment.data.length > 0) ?
                                                    <div className="comment_container">
                                                        {state.comment.data.map((item) => (
                                                            <CommentItem
                                                                key={item.id}
                                                                data={item}
                                                            />
                                                        ))}
                                                        {
                                                            load.hasMore &&
                                                            <button id="more_comment_btn" onClick={() => handleLoadComment()}>
                                                                {
                                                                    load.handling ?
                                                                        <LoadingContent scale={0.5} />
                                                                        :
                                                                        <>
                                                                            More comments...
                                                                        </>
                                                                }
                                                            </button>
                                                        }
                                                    </div>
                                                    :
                                                    <p className="no_data">
                                                        No comment can be show here ! Throw new comment on below.
                                                    </p>
                                    }
                                </div>
                                <Form onSubmit={submitComment} id="comment_input">
                                    <div className="input_text">
                                        <textarea
                                            id='input_comment'
                                            name='comment'
                                            rows='4'
                                            placeholder="Throw your new comment here..."
                                            value={comment.content}
                                            readOnly={handling}
                                            onChange={(e) => setComment(prev => ({ ...prev, content: e.target.value }))}
                                        />
                                        <div className="comment_handler">
                                            <button
                                                type="submit"
                                                disabled={handling || comment.content.length === 0}
                                                style={comment.content.length > 0 ?
                                                    {
                                                        'color': 'var(--color_white)',
                                                        'background': 'var(--color_blue)',
                                                        'transition': '0.2s all ease'
                                                    }
                                                    :
                                                    {
                                                        'color': 'var(--color_black)',
                                                        'background': 'var(--color_gray_light)',
                                                        'transition': '0.2s all ease'
                                                    }
                                                }
                                            >
                                                {
                                                    handling ?
                                                        <LoadingContent scale={0.5} color={'var(--color_white)'} />
                                                        :
                                                        <IoSend fontSize={18} />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                    <div>
                                    </div>
                                </Form>
                            </div>
                        </div>
            }
            <div className="footer_preview">
                <button id="join_course_btn">
                    Join course
                </button>
            </div>
            <AlertPush
                status={alert?.status}
                message={alert?.message}
            />
        </section>
    )
}