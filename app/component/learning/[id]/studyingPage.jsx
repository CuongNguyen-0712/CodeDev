'use client'
import { useState, useEffect, useRef, useTransition } from "react"

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import { useApp } from "@/app/contexts/appContext";

import { useQuery } from "@tanstack/react-query";
import { userQueries } from "@/app/query/user.query";

import { useSession } from "next-auth/react";

import { useRouterActions } from "@/app/router/useRouterActions";

import LearningLesson from "./lessons";

import { FaAngleLeft, FaAngleRight, FaCheck } from "react-icons/fa6";
import { MdInfoOutline } from "react-icons/md";
import { TbLayoutSidebarLeftCollapseFilled, TbReload } from "react-icons/tb";
import { IoMdList } from "react-icons/io";
import { BiMessageSquareDetail } from "react-icons/bi";

export default function StudyingPage({ params }) {
    const { navigateBack, navigate } = useRouterActions();
    const { status } = useSession();

    const [slider, setSlider] = useState(true)
    const [view, setView] = useState(false)

    const [isNavigating, startTransition] = useTransition();

    const { data, isLoading, isError, error, refetch, dataUpdatedAt } = useQuery(userQueries.learningProgress(status, params.id))

    const [selectedData, setSelectedData] = useState(null)

    const getCurrentLesson = (data) => {
        const lesson = data?.modules
            ?.flatMap(module => module.lessons)
            .filter(lesson => lesson.status !== 'enrolled')
            .sort((a, b) => new Date(b.last_at) - new Date(a.last_at))[0];

        return {
            module: lesson?.module_id ?? null,
            lesson: lesson?.id ?? null,
            status: lesson?.status ?? null
        };
    };

    useEffect(() => {
        if (!data || selectedData) return;

        setSelectedData(getCurrentLesson(data));
    }, [data, selectedData]);

    useEffect(() => {
        setSelectedData(getCurrentLesson(data));
    }, [dataUpdatedAt]);

    const handleNavigate = (path) => {
        if (!path) return;

        startTransition(() => {
            navigate({ path: path.path });
        })
    }

    return (
        <div id="course_page_layout">
            <nav className="nav_layout_params">
                <div className="nav_layout_heading">
                    <button onClick={navigateBack}>
                        <FaAngleLeft fontSize={20} color="var(--white)" />
                    </button>
                    <img
                        src={data?.language_logo || '/image/static/no_image.png'}
                        alt={data?.title || 'Course'}
                        width={40}
                        height={40}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/image/static/no_image.png';
                        }}
                    />
                    {
                        isLoading ?
                            <LoadingContent scale={0.5} color='var(--white)' />
                            :
                            <h3>
                                {data?.title || '___'}
                            </h3>
                    }
                </div>
                <div className="nav_layout_handler">
                    <button
                        onClick={() => setView(!view)}
                    >
                        <MdInfoOutline fontSize={24} color="var(--white)" />
                    </button>
                    <button
                        className="lesson_view_btn"
                        onClick={() => setSlider(!slider)}
                    >
                        <IoMdList fontSize={24} color="var(--white)" />
                    </button>
                </div>
            </nav>
            <div id="course_param_content">
                <div className="lesson_view">
                    {
                        isLoading ?
                            <LoadingContent />
                            :
                            <LearningLesson lessonId={selectedData?.lesson} courseId={params.id} isSubmit={selectedData?.status === 'in_progress'} />
                    }
                </div>
                <div className={`slider ${slider ? 'active' : ''}`}>
                    <div className='course_slider'>
                        {
                            isLoading ?
                                <LoadingContent />
                                :
                                isError ?
                                    <ErrorReload data={error} refetch={refetch} />
                                    :
                                    <div className="frame_slider">
                                        {
                                            data?.modules && data?.modules.length > 0 ?
                                                data.modules.map((item, index) => (
                                                    <section key={index} className={`module ${selectedData?.module === item.id ? 'target' : ''} ${item.is_continue && course.module !== item.id ? 'continue' : ''} ${selectedData?.module === item.id && selectedData?.lesson !== item.id ? 'selected' : ''}`}>
                                                        <button
                                                            className="module_heading"
                                                            onClick={() => setSelectedData(prev => ({ ...prev, module: prev.module === item.id ? prev.module : item.id }))}
                                                        >
                                                            <div className='module_header'>
                                                                <h4>Chapter {index + 1}</h4>
                                                                <div className="icon_module">
                                                                    <FaAngleRight />
                                                                </div>
                                                            </div>
                                                            <h4>
                                                                {item.title}
                                                            </h4>
                                                        </button>
                                                        <div
                                                            className="lessons"
                                                            style={selectedData?.module === item.id ? { height: `${item.lessons.length * 55 + (item.lessons.length - 1) * 5 + 20}px` } : { height: '0px' }}
                                                        >
                                                            {
                                                                item.lessons.map((lesson, index) => (
                                                                    <div
                                                                        key={index}
                                                                        className={`lesson ${selectedData?.lesson === lesson.id ? 'target' : ''}`}
                                                                    >
                                                                        <span
                                                                            className="target_lesson"
                                                                            style={{
                                                                                ...{
                                                                                    'enrolled': { background: 'var(--gray-200)', color: 'var(--black)' },
                                                                                    'in_progress': { background: 'var(--color-primary)', color: 'var(--white)' },
                                                                                    'completed': { background: 'var(--color-success)', color: 'var(--white)' },
                                                                                }[lesson.status]
                                                                            }}
                                                                        >
                                                                            <FaCheck fontSize={14} />
                                                                        </span>
                                                                        <button
                                                                            className="lesson_title"
                                                                            disabled={lesson.status === 'enrolled'}
                                                                            onClick={() => setSelectedData(prev => ({ ...prev, lesson: lesson.id, module: item.id, status: lesson.status }))}
                                                                        >
                                                                            {lesson.title}
                                                                        </button>
                                                                    </div>
                                                                ))
                                                            }
                                                        </div>
                                                    </section>
                                                ))
                                                :
                                                <p className="no_data">No data can be shown here, try later!</p>
                                        }
                                    </div>
                        }
                    </div>
                    <div className="footer_slider">
                        <button
                            id="handle_slider"
                            onClick={() => setSlider(false)}
                        >
                            Collapse
                            <TbLayoutSidebarLeftCollapseFilled fontSize={18} color={'var(--white)'} />
                        </button>
                        <button
                            id="reload_slider"
                            onClick={() => refreshGetCourse()}
                        >
                            <TbReload fontSize={18} />
                        </button>
                    </div>
                </div>
                <div
                    id="view_state"
                    style={view ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }}
                >
                    {
                        isLoading ?
                            <LoadingContent message={"Loading course data..."} />
                            :
                            isError ?
                                <ErrorReload data={error} refetch={refetch} />
                                :
                                data ?
                                    <>
                                        <div className="view_course">
                                            <img
                                                src={data?.language_logo || '/image/static/no_image.png'}
                                                alt={data?.title || 'Course'}
                                                height={100}
                                                width={100}
                                                onError={(e) => {
                                                    e.target.onerror = null;
                                                    e.target.src = '/image/static/no_image.png';
                                                }}
                                            />
                                            <h2>
                                                {data?.title}
                                            </h2>
                                            <p>
                                                {data?.description}
                                            </p>
                                        </div>
                                        <div className="footer_view">
                                            <button
                                                onClick={() => setView(false)}
                                            >
                                                Close
                                            </button>
                                            <button
                                                onClick={() => handleNavigate({ path: `/course/${data?.id}` })}
                                                disabled={isNavigating || isLoading}
                                            >
                                                {
                                                    isNavigating ?
                                                        <LoadingContent scale={0.5} color='var(--white)' />
                                                        :
                                                        <>
                                                            <BiMessageSquareDetail fontSize={18} />
                                                            More info
                                                        </>
                                                }
                                            </button>
                                        </div>
                                    </>
                                    :
                                    <p className="no_data">Data can not be loaded, please try again!</p>
                    }
                </div>
            </div>
        </div>
    )
}