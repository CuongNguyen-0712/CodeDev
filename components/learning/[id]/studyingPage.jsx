'use client'
import { useState, useEffect, useTransition } from "react"

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/queries/user.query";
import { useSession } from "next-auth/react";
import { useRouterActions } from "@/router/useRouterActions";
import { useApp } from "@/contexts/appContext";
import useViewport from "@/hooks/useViewport";

import LearningLesson from "./lessons";

import { FaAngleLeft, FaAngleRight, FaCheck, FaLock, FaPlay } from "react-icons/fa6";
import { MdInfoOutline, MdOutlineClose, MdOutlineQuiz } from "react-icons/md";
import { TbLayoutSidebarRightCollapse, TbReload } from "react-icons/tb";
import { IoMdList } from "react-icons/io";
import { BiMessageSquareDetail } from "react-icons/bi";

import "@/styles/learning/[id]/study.css"
import "@/styles/learning/[id]/challenge.css"

export default function StudyingPage({ params }) {
    const { navigateBack, navigate } = useRouterActions();
    const { status } = useSession();
    const { overlay, setOverlay } = useApp();
    const viewport = useViewport();
    const isMobile = viewport.width > 0 && viewport.width <= 1024;

    const [desktopSlider, setDesktopSlider] = useState(true);
    const [isNavigating, startTransition] = useTransition();

    const isSliderOpen = isMobile ? overlay === 'slider' : desktopSlider;
    const isViewOpen = overlay === 'view';

    const handleToggleSlider = () => {
        if (isMobile) {
            setOverlay(prev => prev === 'slider' ? null : 'slider');
        } else {
            setDesktopSlider(prev => !prev);
        }
    };

    const handleCloseSlider = () => {
        if (isMobile) {
            setOverlay(null);
        } else {
            setDesktopSlider(false);
        }
    };

    const handleToggleView = () => {
        setOverlay(prev => prev === 'view' ? null : 'view');
    };

    const handleCloseView = () => {
        setOverlay(null);
    };

    useEffect(() => {
        if (!isMobile) {
            setOverlay(null);
        }
    }, [isMobile]);

    useEffect(() => {
        return () => {
            setOverlay(null);
        };
    }, [setOverlay]);

    const {
        data,
        isLoading,
        isError,
        error,
        refetch,
        isFetching,
        dataUpdatedAt
    } = useQuery(userQueries.learningProgress(status, params.id));

    const [selectedData, setSelectedData] = useState(null);

    // Compute all flat lessons and stats
    const allLessons = data?.modules?.flatMap(module =>
        (module.lessons || []).map(lesson => ({
            ...lesson,
            module_id: module.id,
            module_title: module.title,
        }))
    ) || [];

    const completedLessonsCount = allLessons.filter(l => l.status === 'completed').length;
    const totalLessonsCount = allLessons.length;
    const totalChallengesCount = allLessons.reduce((acc, l) => acc + (l.challenges?.length || 0), 0);
    const progressPercent = totalLessonsCount > 0
        ? Math.round((completedLessonsCount / totalLessonsCount) * 100)
        : 0;

    const getCurrentLesson = (courseData) => {
        if (!courseData?.modules?.length) return null;

        const lessons = courseData.modules
            .flatMap(module => module.lessons || [])
            .filter(lesson => lesson.status !== 'enrolled')
            .sort((a, b) => new Date(b.last_seen || 0) - new Date(a.last_seen || 0));

        const targetLesson = lessons[0] || courseData.modules[0]?.lessons?.[0];

        if (!targetLesson) return null;

        // Find module ID
        const parentModule = courseData.modules.find(m =>
            m.lessons?.some(l => l.id === targetLesson.id)
        );

        return {
            module: parentModule?.id ?? targetLesson.module_id ?? null,
            lesson: targetLesson.id,
            status: targetLesson.status
        };
    };

    useEffect(() => {
        if (!data || selectedData) return;
        const initial = getCurrentLesson(data);
        if (initial) setSelectedData(initial);
    }, [data, selectedData]);

    useEffect(() => {
        if (!data) return;
        // Keep selected lesson synced if updated
        if (selectedData?.lesson) {
            const updated = allLessons.find(l => l.id === selectedData.lesson);
            if (updated && updated.status !== selectedData.status) {
                setSelectedData(prev => ({ ...prev, status: updated.status }));
            }
        }
    }, [dataUpdatedAt]);

    const isLessonUnlocked = (lesson, indexInAll) => {
        if (!lesson) return false;
        // First lesson of the whole course is always unlocked
        if (indexInAll === 0) return true;
        return lesson.status === 'completed' || lesson.status === 'in_progress';
    };

    const handleSelectLesson = (lesson, moduleId) => {
        if (!lesson) return;
        const lessonIndex = allLessons.findIndex(l => l.id === lesson.id);
        const isUnlocked = isLessonUnlocked(lesson, lessonIndex);
        if (!isUnlocked) return;

        setSelectedData({
            module: moduleId,
            lesson: lesson.id,
            status: lesson.status,
        });

        if (isMobile) {
            setOverlay(null);
        }
    };

    const currentLessonIndex = allLessons.findIndex(l => l.id === selectedData?.lesson);
    const currentLesson = currentLessonIndex >= 0 ? allLessons[currentLessonIndex] : null;
    const prevLesson = currentLessonIndex > 0 ? allLessons[currentLessonIndex - 1] : null;
    const nextLesson = currentLessonIndex >= 0 && currentLessonIndex < allLessons.length - 1
        ? allLessons[currentLessonIndex + 1]
        : null;

    const isPrevUnlocked = prevLesson ? isLessonUnlocked(prevLesson, currentLessonIndex - 1) : false;
    const isNextUnlocked = nextLesson ? isLessonUnlocked(nextLesson, currentLessonIndex + 1) : false;
    const isCurrentLessonLocked = selectedData ? !isLessonUnlocked(selectedData, currentLessonIndex) : false;

    const handleNavigate = (path) => {
        if (!path) return;
        startTransition(() => {
            navigate({ path: path.path });
        });
    };

    const handleBack = () => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
            navigateBack();
        } else {
            navigate({ path: '/learning' });
        }
    };

    return (
        <div id="studying_page_layout">
            {/* Top Navigation Bar */}
            <nav className="nav_layout_params">
                <div className="nav_layout_heading">
                    <button
                        onClick={handleBack}
                        title="Back to courses"
                        aria-label="Back to courses"
                        className="btn-nav-back"
                    >
                        <FaAngleLeft fontSize={18} />
                    </button>

                    <div className="nav-course-brand">
                        <img
                            src={data?.language_logo || '/image/static/no_image.png'}
                            alt={data?.title || 'Course'}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = '/image/static/no_image.png';
                            }}
                        />
                        <div className="nav-course-titles">
                            <h3>{data?.title || (isLoading ? 'Loading course...' : 'Course')}</h3>
                            {totalLessonsCount > 0 && (
                                <span className="nav-course-meta">
                                    {completedLessonsCount}/{totalLessonsCount} completed ({progressPercent}%)
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="nav_layout_handler">
                    <button
                        onClick={handleToggleView}
                        className={`btn-nav-action ${isViewOpen ? 'active' : ''}`}
                        title="Course Information"
                        aria-label="Course Information"
                    >
                        <MdInfoOutline fontSize={20} />
                    </button>

                    <button
                        className={`lesson_view_btn btn-nav-action ${isSliderOpen ? 'active' : ''}`}
                        onClick={handleToggleSlider}
                        title={isSliderOpen ? "Collapse Syllabus" : "Expand Syllabus"}
                        aria-label="Toggle Syllabus"
                    >
                        <IoMdList fontSize={20} />
                    </button>
                </div>
            </nav>

            {/* Main Content Area */}
            <div id="course_param_content">
                {/* Lesson Body Area */}
                <div className="lesson_view">
                    {isLoading ? (
                        <div className="lesson-loading-wrapper">
                            <LoadingContent message="Loading lesson material..." />
                        </div>
                    ) : isError ? (
                        <div className="lesson-error-wrapper">
                            <ErrorReload data={error} refetch={refetch} />
                        </div>
                    ) : (
                        <LearningLesson
                            lessonId={selectedData?.lesson}
                            courseId={params.id}
                            isSubmit={selectedData?.status === 'completed'}
                            isLocked={isCurrentLessonLocked}
                            onSubmitted={() => refetch()}
                            prevLesson={prevLesson}
                            nextLesson={nextLesson}
                            isPrevUnlocked={isPrevUnlocked}
                            isNextUnlocked={isNextUnlocked}
                            onSelectLesson={(lesson) => handleSelectLesson(lesson, lesson.module_id)}
                            challenges={currentLesson?.challenges || []}
                        />
                    )}
                </div>

                {/* Course Syllabus Sidebar */}
                <aside className={`slider ${isSliderOpen ? 'active' : ''}`}>
                    <div className="sidebar-header">
                        <div className="sidebar-header-title">
                            <IoMdList fontSize={18} />
                            <h4>Course Syllabus</h4>
                        </div>
                        <span className="sidebar-progress-badge">
                            {completedLessonsCount}/{totalLessonsCount} done
                        </span>
                    </div>

                    <div className="course_slider">
                        {isLoading ? (
                            <LoadingContent scale={0.7} message="Loading modules..." />
                        ) : isError ? (
                            <ErrorReload data={error} refetch={refetch} />
                        ) : (
                            <div className="frame_slider">
                                {data?.modules && data?.modules.length > 0 ? (
                                    data.modules.map((item, index) => {
                                        const isModuleOpen = selectedData?.module === item.id;
                                        const completedInModule = (item.lessons || []).filter(l => l.status === 'completed').length;

                                        return (
                                            <section
                                                key={item.id || index}
                                                className={`module ${isModuleOpen ? 'target selected' : ''}`}
                                            >
                                                <button
                                                    type="button"
                                                    className="module_heading"
                                                    onClick={() => setSelectedData(prev => ({
                                                        ...prev,
                                                        module: prev?.module === item.id ? null : item.id
                                                    }))}
                                                    aria-expanded={isModuleOpen}
                                                >
                                                    <div className="module_header">
                                                        <span className="chapter-pill">Chapter {index + 1}</span>
                                                        <span className="chapter-count">
                                                            {completedInModule}/{item.lessons?.length || 0}
                                                        </span>
                                                        <div className="icon_module">
                                                            <FaAngleRight />
                                                        </div>
                                                    </div>
                                                    <h4 className="module_title">{item.title}</h4>
                                                </button>

                                                <div
                                                    className="lessons"
                                                    style={{
                                                        maxHeight: isModuleOpen ? `${(item.lessons?.length || 1) * 75 + 30}px` : '0px',
                                                        opacity: isModuleOpen ? 1 : 0
                                                    }}
                                                >
                                                    {item.lessons?.map((lesson, lIndex) => {
                                                        const isCurrent = selectedData?.lesson === lesson.id;
                                                        const isCompleted = lesson.status === 'completed';
                                                        const isInProgress = lesson.status === 'in_progress';
                                                        const overallIndex = allLessons.findIndex(l => l.id === lesson.id);
                                                        const isUnlocked = isLessonUnlocked(lesson, overallIndex);
                                                        const isLocked = !isUnlocked;

                                                        return (
                                                            <div
                                                                key={lesson.id || lIndex}
                                                                className={`lesson ${isCurrent ? 'target' : ''} ${lesson.status || 'enrolled'} ${isLocked ? 'locked disabled' : ''}`}
                                                            >
                                                                <span
                                                                    className={`target_lesson status-${isLocked ? 'enrolled' : (lesson.status || 'enrolled')}`}
                                                                    title={isCompleted ? 'Completed' : isInProgress ? 'In Progress' : 'Locked'}
                                                                >
                                                                    {isCompleted ? (
                                                                        <FaCheck fontSize={12} />
                                                                    ) : isInProgress ? (
                                                                        <FaPlay fontSize={10} />
                                                                    ) : (
                                                                        <FaLock fontSize={10} />
                                                                    )}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="lesson_title"
                                                                    onClick={() => !isLocked && handleSelectLesson(lesson, item.id)}
                                                                    disabled={isLocked}
                                                                    aria-disabled={isLocked}
                                                                    title={isLocked ? "Lesson is locked. Complete the previous lesson to unlock." : lesson.title}
                                                                >
                                                                    <span className="lesson_number">{lIndex + 1}.</span>
                                                                    <span className="lesson_name">{lesson.title}</span>
                                                                    {lesson.challenges && lesson.challenges.length > 0 && (
                                                                        <span className="lesson-challenge-chip" title={`${lesson.challenges.length} Quiz available`}>
                                                                            <MdOutlineQuiz fontSize={11} />
                                                                            <span>Quiz</span>
                                                                        </span>
                                                                    )}
                                                                    {isLocked && <FaLock className="lesson_lock_badge" fontSize={10} aria-hidden="true" />}
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </section>
                                        );
                                    })
                                ) : (
                                    <p className="no_data">No modules available for this course yet.</p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="footer_slider">
                        <button
                            id="handle_slider"
                            type="button"
                            onClick={handleCloseSlider}
                            title="Collapse sidebar"
                        >
                            <TbLayoutSidebarRightCollapse fontSize={18} />
                            <span>Collapse</span>
                        </button>
                        <button
                            id="reload_slider"
                            type="button"
                            onClick={() => refetch()}
                            title="Refresh progress"
                            aria-label="Refresh course progress"
                            disabled={isFetching}
                        >
                            <TbReload fontSize={18} className={isFetching ? 'spin-anim' : ''} />
                        </button>
                    </div>
                </aside>

                {/* Course Info Drawer / Modal */}
                <div
                    id="view_state"
                    className={isViewOpen ? 'open' : ''}
                    role="dialog"
                    aria-label="Course information"
                >
                    <div className="view_state_header">
                        <h4>Course Details</h4>
                        <button
                            type="button"
                            className="btn-view-close"
                            onClick={handleCloseView}
                            aria-label="Close details"
                        >
                            <MdOutlineClose fontSize={20} />
                        </button>
                    </div>

                    {isLoading ? (
                        <LoadingContent message="Loading course data..." />
                    ) : isError ? (
                        <ErrorReload data={error} refetch={refetch} />
                    ) : data ? (
                        <>
                            <div className="view_course">
                                <div className="view_course_logo">
                                    <img
                                        src={data?.language_logo || '/image/static/no_image.png'}
                                        alt={data?.title || 'Course'}
                                        onError={(e) => {
                                            e.target.onerror = null;
                                            e.target.src = '/image/static/no_image.png';
                                        }}
                                    />
                                </div>
                                <h2>{data?.title}</h2>
                                <p>{data?.description || data?.concept || "No full description provided."}</p>

                                <div className="view_course_stats">
                                    <div className="stat_box">
                                        <span className="stat_val">{data?.modules?.length || 0}</span>
                                        <span className="stat_lbl">Chapters</span>
                                    </div>
                                    <div className="stat_box">
                                        <span className="stat_val">{totalLessonsCount}</span>
                                        <span className="stat_lbl">Lessons</span>
                                    </div>
                                    {totalChallengesCount > 0 && (
                                        <div className="stat_box">
                                            <span className="stat_val">{totalChallengesCount}</span>
                                            <span className="stat_lbl">Quizzes</span>
                                        </div>
                                    )}
                                    <div className="stat_box">
                                        <span className="stat_val">{progressPercent}%</span>
                                        <span className="stat_lbl">Done</span>
                                    </div>
                                </div>
                            </div>

                            <div className="footer_view">
                                <button
                                    type="button"
                                    className="btn-close-drawer"
                                    onClick={handleCloseView}
                                >
                                    Close
                                </button>
                                <button
                                    type="button"
                                    className="btn-more-info"
                                    onClick={() => handleNavigate({ path: `/course/${data?.id}` })}
                                    disabled={isNavigating || isLoading}
                                >
                                    {isNavigating ? (
                                        <LoadingContent scale={0.4} color='var(--white)' />
                                    ) : (
                                        <>
                                            <BiMessageSquareDetail fontSize={18} />
                                            <span>Course Overview</span>
                                        </>
                                    )}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="no_data">Unable to load course data.</p>
                    )}
                </div>
            </div>
        </div>
    );
}