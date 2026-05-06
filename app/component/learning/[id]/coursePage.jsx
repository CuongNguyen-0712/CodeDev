'use client'
import { useState, useEffect, startTransition } from "react"

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";

import { useApp } from "@/app/contexts/appContext";

import LessonPage from "./lessonPage";

import { useRouterActions } from "@/app/router/useRouterActions";

import { api } from "@/app/lib/axios";

import { FaAngleLeft, FaAngleRight, FaCheck } from "react-icons/fa6";
import { MdInfoOutline } from "react-icons/md";
import { TbLayoutSidebarLeftCollapseFilled, TbReload } from "react-icons/tb";
import { IoMdList } from "react-icons/io";
import { BiMessageSquareDetail } from "react-icons/bi";

export default function CoursePage({ params } = {}) {
    const { navigateBack, navigateToCourse } = useRouterActions();

    const [state, setState] = useState({
        data: {},
        pending: true
    })

    const [mapping, setMapping] = useState({})

    const [slider, setSlider] = useState(false)
    const [view, setView] = useState(false)
    const { showAlert: alert } = useApp();

    const [course, setCourse] = useState({
        module: null,
        lesson: null,
        handling: false,
        pending: true,
        error: null,
    })

    const [lesson, setLesson] = useState({
        data: null,
        pending: true,
        handling: false,
        error: null,
    })

    const [redirect, setRedirect] = useState(false)
    const getStateCourse = async () => {
        if (!params.course_id) {
            setState((prev) => ({
                ...prev,
                pending: false
            }))

            return;
        };

        try {
            const response = await api.get(`/get/getStateCourse`, {
                params: {
                    courseId: params.course_id
                }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data[0] : []
                setState((prev) => ({
                    ...prev,
                    data: data
                }))
            }
            else {
                alert(response.status, response.data?.message || 'Failed to load course data. Please try again.');
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || 'External server error');
        } finally {
            setState((prev) => ({
                ...prev,
                pending: false
            }))
        }
    }


    const getCourse = async ({ hasSubmit = false } = {}) => {
        if (!params.course_id) {
            setCourse((prev) => ({
                ...prev,
                pending: false
            }))

            return;
        };

        try {
            const response = await api.get('get/getContentCourse', {
                params: {
                    courseId: params.course_id
                }
            });
            if (response.data.success) {
                const validData = Array.isArray(response.data.data) ? [...response.data.data] : [];
                const data =
                    (hasSubmit
                        ? validData.find((item) => item.status === 'In Progress')
                        : validData
                            .slice()
                            .sort((a, b) => new Date(b.last_at) - new Date(a.last_at))[0]
                    ) ?? validData.at(-1);

                if (!data) {
                    setCourse((prev) => ({
                        ...prev,
                        pending: false
                    }))

                    return;
                }

                setCourse((prev) => ({
                    ...prev,
                    module: data.module_id,
                    lesson: data.lesson_id,
                    pending: false
                }))

                const map = validData.reduce((acc, { module_id, module_title, ...rest }) => {
                    if (!acc[module_id]) {
                        acc[module_id] = {
                            id: module_id,
                            title: module_title,
                            lessons: []
                        };
                    }
                    acc[module_id].lessons.push(rest);
                    return acc;
                }, {});

                if (Object.values(map)?.length === 0) {
                    setCourse((prev) => ({
                        ...prev,
                        pending: false
                    }))

                    return;
                }

                setMapping(map);
            }
            else {
                setCourse((prev) => ({
                    ...prev,
                    error: {
                        status: response.status ?? 500,
                        message: response.data?.message || 'External error server'
                    },
                    pending: false
                }))
            }
        } catch (error) {
            setCourse((prev) => ({
                ...prev,
                error: {
                    status: error.response?.status ?? 500,
                    message: error.response?.data?.message || 'Something is error, try again!'
                },
                pending: false
            }))
        }
    }

    useEffect(() => {
        getCourse();
        getStateCourse();
    }, [])

    const getContentLesson = async (data) => {
        setLesson((prev) => ({
            ...prev,
            error: null,
        }))

        setCourse((prev) => ({
            ...prev,
            lesson: data
        }))

        try {
            const response = await api.get('get/getContentLesson', {
                params: {
                    courseId: params.course_id,
                    lessonId: data
                }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data[0] : {}
                setLesson((prev) => ({
                    ...prev,
                    data: data,
                }))
            }
            else {
                setLesson((prev) => ({
                    ...prev,
                    error: {
                        status: response.status ?? 500,
                        message: response.data?.message || 'Something is error, try again!'
                    },
                }))
            }
        } catch (err) {
            setLesson((prev) => ({
                ...prev,
                error: {
                    status: err.response?.status ?? 500,
                    message: err.response?.data?.message || 'External server error'
                },
            }))
        } finally {
            setLesson((prev) => ({
                ...prev,
                pending: false
            }))

            startTransition(() => {
                setLesson((prev) => ({
                    ...prev,
                    handling: false
                }))
            })
        }
    }

    useEffect(() => {
        if (course.pending) return;

        if (!course.lesson) {
            setLesson((prev) => ({
                ...prev,
                pending: false,
            }))

            return;
        }

        getContentLesson(course.lesson);
    }, [lesson.handling, course.pending, course.lesson])

    const submitLesson = async ({ lesson_id }) => {
        if (!lesson_id || lesson.handling) return;

        setLesson((prev) => ({
            ...prev,
            handling: true
        }))

        try {
            const response = await api.patch('update/updateLesson', {
                courseId: params.course_id,
                lessonId: lesson_id
            })
            if (response.data.success) {
                alert(200, 'Congratulations! You have successfully completed this lesson.');
                await getCourse({ hasSubmit: true });
            }
            else {
                setLesson((prev) => ({
                    ...prev,
                    handling: false
                }))
                alert(response.status, response.data?.message || 'Something is wrong, try again');
            }
        } catch (err) {
            alert(err.response?.status ?? 500, err.response?.data?.message || 'External server error');
            setLesson((prev) => ({
                ...prev,
                handling: false
            }))
        }
    }

    const refreshGetCourse = () => {
        setCourse((prev) => ({
            ...prev,
            error: null,
            pending: true,
        }))
        getCourse();
    }

    const refreshGetLesson = () => {
        setLesson((prev) => ({
            ...prev,
            error: null,
            pending: true,
        }))
        getContentLesson(course.lesson);
    }

    const redirectToDetailCourse = ({ id }) => {
        if (!id) return;

        setRedirect(true)
        navigateToCourse(id)
    }

    return (
        <div id="course_page_layout">
            <nav className="nav_layout_params">
                <div className="nav_layout_heading">
                    <button onClick={navigateBack}>
                        <FaAngleLeft fontSize={20} color="var(--color_white)" />
                    </button>
                    <img src={state.data?.image ?? '/image/static/logo.svg'} alt="logo" />
                    {
                        state.pending ?
                            <LoadingContent scale={0.5} color='var(--color_white)' />
                            :
                            <h3>
                                {state.data?.title || '___'}
                            </h3>
                    }
                </div>
                <div className="nav_layout_handler">
                    <button
                        onClick={() => setView(!view)}
                    >
                        <MdInfoOutline fontSize={24} color="var(--color_white)" />
                    </button>
                    <button
                        className="lesson_view_btn"
                        onClick={() => setSlider(!slider)}
                    >
                        <IoMdList fontSize={24} color="var(--color_white)" />
                    </button>
                </div>
            </nav>
            <div id="course_param_content">
                <div className="lesson_view">
                    {
                        lesson.pending ?
                            <LoadingContent message={'Waitting for lesson data...'} />
                            :
                            lesson.error ?
                                <ErrorReload data={lesson?.error} refetch={() => refreshGetLesson()} />
                                :
                                (Object.values(lesson.data ?? {}).length > 0) ?
                                    <>
                                        <div id="view">
                                            <LessonPage
                                                id={lesson.data?.source}
                                                status={lesson.data.status === 'In Progress'}
                                                submit={() => submitLesson({ lesson_id: lesson.data.lesson_id })}
                                                isHandling={lesson.handling}
                                            />
                                        </div>
                                    </>
                                    :
                                    <p className='no_data'>Data can not be loaded, please try again!</p>
                    }
                </div>
                <div className={`slider ${slider ? 'active' : ''}`}>
                    <div className='course_slider'>
                        {
                            course.pending ?
                                <LoadingContent />
                                :
                                course.error ?
                                    <ErrorReload data={course?.error} refetch={() => refreshGetCourse()} />
                                    :
                                    (Object.values(mapping).length > 0 || Object.values(mapping).includes(undefined)) ?
                                        <div className="frame_slider">
                                            {
                                                Object.values(mapping).map((item, index) => (
                                                    <section key={index} className={`module ${course.module === item.id ? 'active' : ''}`}>
                                                        <button
                                                            className="module_heading"
                                                            onClick={() => {
                                                                setCourse((prev) => ({
                                                                    ...prev,
                                                                    module: item.id === prev.module ? lesson.data.module_id : item.id
                                                                }))
                                                            }}
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
                                                            style={course.module === item.id ? { height: `${item.lessons.length * 55 + (item.lessons.length - 1) * 5 + 20}px` } : { height: '0px' }}
                                                        >
                                                            {
                                                                item.lessons.map((lesson, index) => (
                                                                    <div
                                                                        key={index}
                                                                        className={`lesson ${course.lesson === lesson.lesson_id ? 'target' : ''}`}
                                                                    >
                                                                        <span
                                                                            className="target_lesson"
                                                                            style={{
                                                                                ...{
                                                                                    'Enrolled': { background: 'var(--color_gray_light)', color: 'var(--color_black)' },
                                                                                    'In Progress': { background: 'var(--color_primary)', color: 'var(--color_white)' },
                                                                                    'Completed': { background: 'var(--color_green)', color: 'var(--color_white)' },
                                                                                }[lesson.status]
                                                                            }}
                                                                        >
                                                                            <FaCheck fontSize={14} />
                                                                        </span>
                                                                        <button
                                                                            className="lesson_title"
                                                                            disabled={lesson.status === 'Enrolled'}
                                                                            onClick={() => getContentLesson(lesson.lesson_id)}
                                                                        >
                                                                            {lesson.lesson_title}
                                                                        </button>
                                                                    </div>
                                                                ))
                                                            }
                                                        </div>
                                                    </section>
                                                ))
                                            }
                                        </div>
                                        :
                                        <p className="no_data">No data can be shown here, try later!</p>
                        }
                    </div>
                    <div className="footer_slider">
                        <button
                            id="handle_slider"
                            onClick={() => setSlider(false)}
                        >
                            Collapse
                            <TbLayoutSidebarLeftCollapseFilled fontSize={18} color={'var(--color_white)'} />
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
                        state.pending ?
                            <LoadingContent message={"Loading course data..."} />
                            :
                            Object.values(state.data).length > 0 ?
                                <>
                                    <div className="view_course">
                                        <img
                                            src={state.data.image}
                                            alt={state.data.title}
                                            height={100}
                                            width={100}
                                        />
                                        <h2>
                                            {state.data.title}
                                        </h2>
                                        <p>
                                            {state.data.description}
                                        </p>
                                    </div>
                                    <div className="footer_view">
                                        <button
                                            onClick={() => setView(false)}
                                        >
                                            Close
                                        </button>
                                        <button
                                            onClick={() => redirectToDetailCourse({ id: state.data.id })}
                                            disabled={redirect}
                                        >
                                            {
                                                redirect ?
                                                    <LoadingContent scale={0.5} color='var(--color_white)' />
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