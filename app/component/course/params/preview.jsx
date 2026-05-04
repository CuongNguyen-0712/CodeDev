'use client'
import { useState, useReducer, useEffect, useRef } from "react"

import { LoadingContent, LoadingRedirect } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import { api } from "@/app/lib/axios";

import { useRouterActions } from "@/app/router/router";

import { uniqWith } from "lodash";

import AlertPush from "../../ui/alert";

import Form from "next/form";

import {
    FaArrowLeft,
    FaStar,
    FaCheckCircle,
    FaThumbsUp,
    FaThumbsDown,
    FaGraduationCap,
    FaPlayCircle
} from "react-icons/fa";
import { BiDetail } from "react-icons/bi";
import { MdPlayLesson } from "react-icons/md";
import { LuAlarmClock } from "react-icons/lu";
import { PiStudent } from "react-icons/pi";
import { IoSend } from "react-icons/io5";

const CommentItem = ({ data, alert }) => {
    const [state, setState] = useState({
        upvotes: Number(data.upvotes),
        downvotes: Number(data.downvotes)
    })

    const [flag, setFlag] = useState({
        upvotes: data.voting === true,
        downvotes: data.voting === false,
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

    const handleVoting = async (e) => {
        const { name } = e.target;

        let newFlag = { ...flag };
        let newState = { ...state };

        const current = Object.entries(flag).find(([_, v]) => v)?.[0];

        if (current !== name) {
            newFlag = { upvotes: false, downvotes: false, [name]: true };
            newState[name] += 1;
            if (current) newState[current] -= 1;
        } else {
            newFlag[name] = !newFlag[name];
            newState[name] += newFlag[name] ? 1 : -1;
        }

        setFlag(newFlag);
        setState(newState);

        try {
            const response = await api.patch('update/updateVotingComment', {
                commentId: data.id,
                voting: newFlag.upvotes ? true : newFlag.downvotes ? false : null
            });

            if (!response.data.success) {
                setFlag(flag);
                setState(state);
                alert({ status: response.status, message: response.data.message || 'Failed to update voting.' });
            }
        } catch {
            setFlag(flag);
            setState(state);
            alert({ status: 500, message: 'Failed to update voting.' });
        }
    };

    return (
        <div className="comment-card">
            <div className="comment-header">
                <img
                    className="comment-avatar"
                    src={data.avatar}
                    alt={data.username}
                    height={44}
                    width={44}
                />
                <div className="comment-user-info">
                    <h4 className="comment-username">{data.username}</h4>
                    <span className="comment-date">{formatDate(data.created_at)}</span>
                </div>
            </div>
            <div className="comment-body">
                <p className="comment-text">{data.comment}</p>
                <div className="comment-actions">
                    <button
                        name="upvotes"
                        onClick={handleVoting}
                        className={`vote-btn upvote ${flag.upvotes ? 'active' : ''}`}
                    >
                        <FaThumbsUp fontSize={14} />
                        <span>{state.upvotes}</span>
                    </button>
                    <button
                        name="downvotes"
                        onClick={handleVoting}
                        className={`vote-btn downvote ${flag.downvotes ? 'active' : ''}`}
                    >
                        <FaThumbsDown fontSize={14} />
                        <span>{state.downvotes}</span>
                    </button>
                </div>
            </div>
        </div>
    )
}

const levelConfig = {
    'Beginner': { color: 'var(--color_green)', bg: 'rgba(16, 185, 129, 0.1)' },
    'Intermediate': { color: 'var(--color_primary)', bg: 'rgba(48, 102, 190, 0.1)' },
    'Advanced': { color: 'var(--color_orange)', bg: 'rgba(245, 158, 11, 0.1)' },
    'Expert': { color: 'var(--color_purple)', bg: 'rgba(139, 92, 246, 0.1)' },
    'Master': { color: 'var(--color_red_dark)', bg: 'rgba(239, 68, 68, 0.1)' }
}

export default function PreviewCourse({ params } = {}) {
    const { navigateBack } = useRouterActions()
    const scrollRef = useRef(null)

    const initialState = {
        state: {
            data: {},
            error: null,
            pending: false,
        },
        lesson: {
            data: [],
            error: null,
            pending: false,
        },
        comment: {
            data: [],
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
                if (key === 'state') return state;

                return {
                    ...state,
                    [key]: {
                        ...state[key],
                        data: uniqWith([...state[key].data, ...payload], (a, b) => a.id === b.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
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

    const [handling, setHandling] = useState({
        comment: false,
        submit: false,
    })

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
            const response = await api.get('get/getStateCourse', {
                params: {
                    courseId: course_id
                }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data[0] : {}
                dispatch({
                    type: ACTIONS.SUCCESS,
                    key: 'state',
                    payload: data
                })
            }
            else {
                dispatch({
                    type: ACTIONS.ERROR,
                    key: 'state',
                    payload: {
                        status: response.status,
                        message: response.message
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
            const response = await api.get('get/getLessonCourse', {
                params: {
                    courseId: course_id
                }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : []
                const payload = data.reduce((acc, { module_id, title, ...rest }) => {
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
                        status: response.status,
                        message: response.message
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
                        const response = await api.get('get/getCommentCourse', {
                            params: {
                                courseId: course_id,
                                offset: adjustedOffset,
                                limit: load.limit.toString()
                            }
                        });
                        if (response.data.success) {
                            const data = Array.isArray(response.data.data) ? response.data.data : [];
                            console.log('Fetched comments:', data);
                            setLoad((prev) => ({
                                ...prev,
                                hasMore: data.length >= prev.limit
                            }))
                            if (data.length > 0) {
                                dispatch({
                                    type: ACTIONS.UPDATE,
                                    key: 'comment',
                                    payload: data
                                })
                            } else {
                                dispatch({
                                    type: ACTIONS.SUCCESS,
                                    key: 'comment',
                                    payload: data
                                })
                            }
                        }
                        else {
                            dispatch({
                                type: ACTIONS.ERROR,
                                key: 'comment',
                                payload: {
                                    status: response.status,
                                    message: response.message
                                }
                            })
                        }
                    }
                    catch (err) {
                        dispatch({
                            type: ACTIONS.ERROR,
                            key: 'comment',
                            payload: {
                                status: err.response?.status || 500,
                                message: err.response?.data?.message || 'External server error'
                            }
                        })
                    }
                    finally {
                        setPending(false)
                        dispatch({
                            type: ACTIONS.END,
                            key: 'comment'
                        })
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
                        const adjustedOffset = Math.max((state.comment.data?.length - load.limit, 0)) || 0
                        const response = await api.get('get/getCommentCourse', {
                            params: {
                                courseId: course_id,
                                offset: adjustedOffset,
                                limit: load.limit.toString()
                            }
                        });
                        if (response.data.success) {
                            const data = Array.isArray(response.data.data) ? response.data.data : [];
                            dispatch({
                                type: ACTIONS.UPDATE,
                                key: 'comment',
                                payload: data
                            })
                            scrollToTop()
                        }
                        else {
                            dispatch({
                                type: ACTIONS.ERROR,
                                key: 'comment',
                                payload: {
                                    status: response.status,
                                    message: response.message
                                }
                            })
                        }
                    }
                    catch (err) {
                        dispatch({
                            type: ACTIONS.ERROR,
                            key: 'comment',
                            payload: {
                                status: err.response?.status || 500,
                                message: err.response?.data?.message || 'External server error'
                            }
                        })
                    }
                    finally {
                        setPending(false)
                        dispatch({
                            type: ACTIONS.END,
                            key: 'comment'
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

        setHandling((prev) => ({
            ...prev,
            comment: true
        }))

        if (comment.content.trim().length === 0 || comment.content === '') {
            setAlert({
                status: 404,
                message: 'No comment, please throw your new!'
            })
            setHandling((prev) => ({
                ...prev,
                comment: false
            }))
            return;
        }

        try {
            const courseId = params.id
            const response = await api.post('post/postCommentCourse', {
                courseId: courseId,
                comment: comment.content
            });

            if (response.data.success) {
                setComment((prev) => ({
                    ...prev,
                    content: ''
                }))
                updateComment({ course_id: courseId })
                setAlert({
                    status: response.status,
                    message: response.message
                })
            }
            else {
                setAlert({
                    status: response.status,
                    message: response.message
                })
            }
        }
        catch (err) {
            setAlert({
                status: err.response?.status || 500,
                message: err.response?.data?.message || 'External server error'
            })
        }
        finally {
            setHandling((prev) => ({
                ...prev,
                comment: false
            }))
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const submitCourse = async () => {
        if (!state.state.data) return;

        setHandling((prev) => ({
            ...prev,
            submit: true,
        }))

        await PostRegisterCourseService(state.state.data.id)
            .then(res => {
                if (res.data.success) {
                    alert("Submitting....")
                }
                else {
                    setAlert({
                        status: res.status,
                        message: res.message
                    })
                }
            })
            .catch(err => {
                setAlert({
                    status: err.response?.status || 500,
                    message: err.response?.data?.message || 'External server error'
                })
            })
            .finally(() => {
                setHandling((prev) => ({
                    ...prev,
                    submit: false,
                }))
            })
    }

    return (
        <section id="course-preview">
            <header className="preview-header">
                <button
                    type="button"
                    className="back-btn"
                    onClick={navigateBack}
                >
                    <FaArrowLeft fontSize={16} />
                </button>
            </header>

            {pending ? (
                <LoadingContent />
            ) : error ? (
                <ErrorReload data={error} refetch={fetchData} />
            ) : (
                <div className="preview-content">
                    <div className="preview-main">
                        {state.state.pending ? (
                            <LoadingContent />
                        ) : state.state.error ? (
                            <ErrorReload
                                data={state.state.error || { status: 500, message: "Something is wrong" }}
                                refetch={() => refetchData('state')}
                            />
                        ) : state.state.data ? (
                            <>
                                <div className="course-hero">
                                    <div className="hero-header">
                                        <img
                                            src={state.state.data.image || '/image/static/logo.svg'}
                                            alt={state.state.data.title}
                                            className="course-logo"
                                        />
                                        <div className="hero-info">
                                            <h1 className="course-title">{state.state.data.title}</h1>
                                            <div className="course-badges">
                                                <span
                                                    className="level-badge"
                                                    style={{
                                                        color: levelConfig?.[state.state.data.level]?.color,
                                                        background: levelConfig?.[state.state.data.level]?.bg
                                                    }}
                                                >
                                                    {state.state.data.level}
                                                </span>
                                                <span className="rating-badge">
                                                    <FaStar color="var(--color_yellow)" />
                                                    {state.state.data.rating}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="course-concept">{state.state.data.concept}</p>
                                </div>

                                <div className="course-details">
                                    <div className="detail-card">
                                        <BiDetail className="detail-icon" />
                                        <p className="detail-text">{state.state.data.description}</p>
                                        <div className="instructor-info">
                                            <FaCheckCircle color="var(--color_primary)" />
                                            <span>Instructor: <strong>{state.state.data.instructor}</strong></span>
                                        </div>
                                    </div>

                                    <div className="stats-grid">
                                        <div className="stat-card">
                                            <MdPlayLesson className="stat-icon lessons" />
                                            <div className="stat-info">
                                                <span className="stat-label">Lessons</span>
                                                <strong className="stat-value">{state.state.data.lessons ?? 0}</strong>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <LuAlarmClock className="stat-icon duration" />
                                            <div className="stat-info">
                                                <span className="stat-label">Duration</span>
                                                <strong className="stat-value">{state.state.data.duration ?? 0}h</strong>
                                            </div>
                                        </div>
                                        <div className="stat-card">
                                            <PiStudent className="stat-icon students" />
                                            <div className="stat-info">
                                                <span className="stat-label">Students</span>
                                                <strong className="stat-value">{state.state.data.students ?? 0}</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="error-text">Something is wrong, try again!</p>
                        )}

                        {state.lesson.pending ? (
                            <LoadingContent />
                        ) : state.lesson.error ? (
                            <ErrorReload
                                data={state.lesson.error || { status: 500, message: "Something is wrong" }}
                                refetch={() => refetchData('lesson')}
                            />
                        ) : state.lesson.data &&
                            Object.values(state.lesson.data).length > 0 ? (
                            <div className="curriculum-section">
                                <h2 className="section-title">
                                    <FaGraduationCap />
                                    Course Curriculum
                                </h2>
                                <div className="modules-list">
                                    {Object.values(state.lesson.data).map((item, index) => (
                                        <div key={item.id} className="module-card">
                                            <div className="module-header">
                                                <span className="chapter-badge">Chapter {index + 1}</span>
                                                <h3 className="module-title">{item.title}</h3>
                                            </div>
                                            <div className="lessons-list">
                                                {item.lessons.map((child, idx) => (
                                                    <div
                                                        key={child.lesson_id}
                                                        className="lesson-item"
                                                    >
                                                        <FaPlayCircle className="lesson-icon" />
                                                        <span className="lesson-name">
                                                            {index + 1}.{idx + 1} - {child.name}
                                                        </span>
                                                        <span className="lesson-type">{child.type}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div className="empty-lessons">
                                <p>No lessons available yet</p>
                            </div>
                        )}
                    </div>

                    <aside className="comments-sidebar" id="comments">
                        <div className="comments-container" ref={scrollRef}>
                            {state.comment.pending ? (
                                <LoadingContent />
                            ) : state.comment.error ? (
                                <ErrorReload
                                    data={state.comment.error}
                                    refetch={() => refetchData('comment')}
                                />
                            ) : Array.isArray(state.comment.data) && state.comment.data.length > 0 ? (
                                <div className="comments-list">
                                    {state.comment.data.map((item) => (
                                        <CommentItem
                                            key={item.id}
                                            data={item}
                                            alert={(data) => setAlert(data)}
                                        />
                                    ))}

                                    {load.hasMore && (
                                        <button
                                            className="load-more-btn"
                                            onClick={handleLoadComment}
                                        >
                                            {load.handling ? (
                                                <LoadingContent scale={0.5} />
                                            ) : (
                                                <>Load more comments</>
                                            )}
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="empty-comments">
                                    <p>No comments yet. Be the first!</p>
                                </div>
                            )}
                        </div>

                        <Form onSubmit={submitComment} className="comment-form">
                            <div className="form-input-wrapper">
                                <textarea
                                    name="comment"
                                    rows="3"
                                    placeholder="Share your thoughts..."
                                    value={comment.content}
                                    readOnly={handling.comment}
                                    onChange={(e) =>
                                        setComment(prev => ({
                                            ...prev,
                                            content: e.target.value
                                        }))
                                    }
                                />
                                <button
                                    type="submit"
                                    className="submit-btn"
                                    disabled={handling.comment || comment.content.length === 0}
                                >
                                    {handling.comment ? (
                                        <LoadingContent scale={0.4} color="var(--color_white)" />
                                    ) : (
                                        <IoSend fontSize={16} />
                                    )}
                                </button>
                            </div>
                        </Form>
                    </aside>
                </div>
            )}

            <footer className="preview-footer">
                <button
                    className="enroll-btn"
                    disabled={!state.state.data || handling.submit}
                    onClick={submitCourse}
                >
                    {!state.state.data || handling.submit ? (
                        <LoadingContent scale={0.5} color="var(--color_white)" />
                    ) : (() => {
                        switch (state.state.data?.status ?? 'Not Enrolled') {
                            case 'Enrolled': return "Start Learning"
                            case 'In Progress': return "Continue Learning"
                            case 'Completed': return "Review Course"
                            default: return "Enroll Now"
                        }
                    })()}
                </button>
            </footer>

            <AlertPush
                status={alert?.status}
                message={alert?.message}
                reset={() => setAlert(null)}
            />
        </section>
    )
}