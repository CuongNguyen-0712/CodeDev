'use client'
import { useState, useReducer, useEffect, useRef, useTransition } from "react"

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import Link from "next/link";

import { useRouterActions } from "@/app/router/useRouterActions";

import { uniqWith } from "lodash";
import { useApp } from "@/app/contexts/appContext";

import Form from "next/form";

import { useQuery } from "@tanstack/react-query";
import { courseQueries } from "@/app/query/course.query";

import {
    FaArrowLeft,
    FaStar,
    FaThumbsUp,
    FaThumbsDown,
    FaGraduationCap,
    FaPlayCircle
} from "react-icons/fa";
import { MdPlayLesson, MdPerson, MdLanguage, MdCategory } from "react-icons/md";
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
        const now = new Date();
        const date = new Date(str);
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 5) {
            return 'Just now';
        } else if (diffInSeconds < 60) {
            return `${diffInSeconds} seconds ago`;
        } else if (diffInSeconds < 3600) {
            const minutes = Math.floor(diffInSeconds / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diffInSeconds < 86400) {
            const hours = Math.floor(diffInSeconds / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        }
        else {
            const days = Math.floor(diffInSeconds / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        }
    };

    const handleVoting = async (e) => {
        e.stopPropagation();

        const name = e.currentTarget.name;

        const previousFlag = flag;
        const previousState = state;

        let newFlag = { ...flag };
        let newState = { ...state };

        const current =
            flag.upvotes
                ? "upvotes"
                : flag.downvotes
                    ? "downvotes"
                    : null;

        if (current !== name) {
            newFlag = {
                upvotes: false,
                downvotes: false,
                [name]: true,
            };

            newState[name] = (newState[name] || 0) + 1;

            if (current) {
                newState[current] = (newState[current] || 0) - 1;
            }
        } else {
            newFlag[name] = !newFlag[name];

            newState[name] =
                (newState[name] || 0) + (newFlag[name] ? 1 : -1);
        }

        setFlag(newFlag);
        setState(newState);

        try {
            const response = await api.patch(
                "update/updateVotingComment",
                {
                    commentId: data.id,
                    voting:
                        newFlag.upvotes
                            ? true
                            : newFlag.downvotes
                                ? false
                                : null,
                }
            );

            if (!response.data.success) {
                setFlag(previousFlag);
                setState(previousState);
            }
        } catch {
            setFlag(previousFlag);
            setState(previousState);
        }
    };

    return (
        <div className="comment-card">
            <Link className="comment-header" href={`/profile/${data.user_id}`} title={data.username}>
                <img
                    className="comment-avatar"
                    src={data.avatar}
                    alt={data.username}
                    height={44}
                    width={44}
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />
                <div className="comment-user-info">
                    <h4 className="comment-username">{data.username}</h4>
                    <span className="comment-date">{formatDate(data.created_at)}</span>
                </div>
            </Link>
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

const levelMapping = {
    'beginner': { tag: 'Beginner', color: 'var(--color-success)', bg: 'rgba(16, 185, 129, 0.1)' },
    'intermediate': { tag: 'Intermediate', color: 'var(--color-primary)', bg: 'rgba(48, 102, 190, 0.1)' },
    'advanced': { tag: 'Advanced', color: 'var(--color-accent-orange)', bg: 'rgba(245, 158, 11, 0.1)' },
    'expert': { tag: 'Expert', color: 'var(--purple-500)', bg: 'rgba(139, 92, 246, 0.1)' },
    'master': { tag: 'Master', color: 'var(--rose-700)', bg: 'rgba(239, 68, 68, 0.1)' }
}

export default function PreviewCourse({ params } = {}) {
    const { showAlert: alert } = useApp()

    const { navigateBack, navigate } = useRouterActions()
    const scrollRef = useRef(null)

    const { data, isLoading, error, refetch } = useQuery(courseQueries.details(params.id))

    const [details, setDetails] = useState(data)

    const [apiQueue, setApiQueue] = useState([]);

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
                        setLoad((prev) => ({
                            ...prev,
                            handling: false
                        }))
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

    const submitComment = async (e) => {
        e.preventDefault();

        if (comment.handling) return;

        if (comment.content.trim().length === 0 || comment.content === '') {
            alert(404, 'No comment, please throw your new!');
            setComment((prev) => ({
                ...prev,
                handling: false
            }))
            return;
        }

        setComment((prev) => ({
            ...prev,
            handling: true
        }))

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
                alert(response.status, response.message);
            }
            else {
                alert(response.status, response.message);
            }
        }
        catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || 'External server error');
        }
        finally {
            setComment((prev) => ({
                ...prev,
                handling: false
            }))
        }
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

            <div className="preview-content">
                <div className="preview-main">
                    {isLoading ?
                        <LoadingContent />
                        :
                        error ?
                            <ErrorReload
                                data={error || { status: 500, message: "An unexpected error occurred" }}
                            />
                            :
                            data ?
                                <>
                                    <div className="course-hero">
                                        <div className="image_preview">
                                            <img
                                                src={data.image || '/image/static/no_image.png'}
                                                alt={data.title}
                                                className="preview-image"
                                                width={800}
                                                height={450}
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                        </div>
                                        <div className="hero-header">
                                            <img
                                                src={data.language_logo || '/image/static/no_image.png'}
                                                alt={data.title}
                                                className="course-logo"
                                                width={100}
                                                height={100}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                            <div className="hero-info">
                                                <h1 className="course-title">{data.title}</h1>
                                                <div className="course-badges">
                                                    <span
                                                        className="course-badge level-badge"
                                                        style={{
                                                            color: levelMapping?.[data.level]?.color,
                                                            background: levelMapping?.[data.level]?.bg
                                                        }}
                                                    >
                                                        {levelMapping?.[data.level]?.tag}
                                                    </span>
                                                    <span className="course-badge rating-badge">
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        <FaStar color="var(--color-warning)" />
                                                        {data.rating}
                                                        <span>
                                                            ({data.reviews})
                                                        </span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="course-concept">{data.concept}</p>
                                    </div>

                                    <div className="course-details">
                                        <div className="detail-card">
                                            <p className="detail-text">{data.description}</p>
                                            <div className="detail-meta">
                                                <Link href={'#'} className="detail-tag instructor" title='Instructor'>
                                                    <MdPerson className="meta-icon" />
                                                    <span className="meta-text">{data.instructor}</span>
                                                </Link>
                                                <Link href={'#'} className="detail-tag category" title='Category'>
                                                    <MdCategory className="meta-icon" />
                                                    <span className="meta-text">{data.category_name}</span>
                                                </Link>
                                                <Link href={'#'} className="detail-tag language" title='Language'>
                                                    <MdLanguage className="meta-icon" />
                                                    <span className="meta-text">{data.language_name}</span>
                                                </Link>
                                            </div>
                                        </div>

                                        <div className="stats-grid">
                                            <div className="stat-card">
                                                <MdPlayLesson className="stat-icon lessons" fontSize={20} />
                                                <div className="stat-info">
                                                    <span className="stat-label">Lessons</span>
                                                    <strong className="stat-value">{data.lessons ?? 0}</strong>
                                                </div>
                                            </div>
                                            <div className="stat-card">
                                                <LuAlarmClock className="stat-icon duration" fontSize={20} />
                                                <div className="stat-info">
                                                    <span className="stat-label">Duration</span>
                                                    <strong className="stat-value">{data.duration ?? 0} min</strong>
                                                </div>
                                            </div>
                                            <div className="stat-card">
                                                <PiStudent className="stat-icon students" fontSize={20} />
                                                <div className="stat-info">
                                                    <span className="stat-label">Students</span>
                                                    <strong className="stat-value">{data.students ?? 0}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </>
                                :
                                <p className="error-text">Something is wrong, try again!</p>
                    }
                    <div className="curriculum-section">
                        <h2 className="section-title">
                            <FaGraduationCap />
                            Course Curriculum
                        </h2>
                        <div className="modules-list">
                            {data.modules && data.modules.length > 0 ? (
                                data.modules.map((item, index) => (
                                    <div key={index} className="module-card">
                                        <div className="module-header">
                                            <span className="chapter-badge">Chapter {index + 1}</span>
                                            <h3 className="module-title">{item.title}</h3>
                                        </div>
                                        <div className="lessons-list">
                                            {item.lessons.map((child, idx) => (
                                                <div
                                                    key={idx}
                                                    className="lesson-item"
                                                >
                                                    <FaPlayCircle className="lesson-icon" />
                                                    <span className="lesson-name">
                                                        {index + 1}.{idx + 1} - {child.title}
                                                    </span>
                                                    <span className="lesson-type">{child.content_type}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )))
                                :
                                <p>No modules available yet</p>
                            }
                        </div>
                    </div>
                </div>

                {/* <aside className="comments-sidebar" id="comments">
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
                                        alert={(status, message) => alert(status, message)}
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
                                readOnly={comment.handling}
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
                                disabled={comment.handling || comment.content.length === 0}
                            >
                                {comment.handling ? (
                                    <LoadingContent scale={0.4} color="var(--white)" />
                                ) : (
                                    <IoSend fontSize={16} />
                                )}
                            </button>
                        </div>
                    </Form>
                </aside> */}
            </div>
            {/* 
            <footer className="preview-footer">
                <button
                    className={`join_btn ${Math.round(state.state.data?.cost) === 0 ? 'free' : 'paid'}`}
                    disabled={isPending}
                    onClick={submitCourse}
                >
                    {state.state.pending || isPending ?
                        <LoadingContent scale={0.5} color="var(--white)" />
                        :
                        Math.round(state.state.data?.cost) === 0 ?
                            (() => {
                                switch (state.state.data?.status) {
                                    case 'enrolled': return "Start learning"
                                    case 'in_progress': return "Continue learning"
                                    case 'completed': return "Review course"
                                    case null: return "Join course"
                                    default: return <LoadingContent scale={0.5} color="var(--white)" />
                                }
                            })()
                            :
                            state.state.data?.cost
                    }
                </button>
            </footer> */}
        </section>
    )
}