'use client'
import { useState, useEffect, startTransition } from "react"

import { LoadingContent } from "../../ui/loading";
import { ErrorReload } from "../../ui/error";
import AlertPush from "../../ui/alert";

import { useRouterActions } from "@/app/router/router";
import GetContentCourseService from "@/app/services/getService/contentCourseService";
import GetContentLessonService from "@/app/services/getService/contentLessonService";
import GetStateCourseService from "@/app/services/getService/stateCourseService";
import UpdateLessonService from "@/app/services/updateService/lessonService";

import { FaAngleLeft, FaAngleRight, FaCheck } from "react-icons/fa6";
import { MdInfoOutline } from "react-icons/md";
import { TbLayoutSidebarLeftCollapseFilled, TbReload } from "react-icons/tb";
import { IoMdList } from "react-icons/io";

export default function CoursePage({ params } = {}) {
    const { navigateBack } = useRouterActions();

    const [state, setState] = useState({
        data: {},
        pending: true
    })

    const [mapping, setMapping] = useState({})

    const [slider, setSlider] = useState(false)
    const [view, setView] = useState(false)

    const [course, setCourse] = useState({
        module: null,
        lesson: null,
        handling: false,
        pending: true,
        error: null
    })

    const [lesson, setLesson] = useState({
        data: null,
        pending: true,
        handling: false,
        error: null,
    })

    const [alert, setAlert] = useState(null)

    const getStateCourse = async () => {
        if (!params.course_id) {
            setState((prev) => ({
                ...prev,
                pending: false
            }))

            return;
        };

        try {
            const res = await GetStateCourseService({ course_id: params.course_id })
            if (res.status === 200) {
                setState((prev) => ({
                    ...prev,
                    data: res.data
                }))
            }
            else {
                setAlert({
                    status: res.status || 500,
                    message: res.message || 'Something is wrong, try again!'
                })
            }
        } catch (err) {
            setAlert({
                status: 500,
                message: err.message || 'External server error'
            })
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
            const res = await GetContentCourseService({ course_id: params.course_id });
            if (res.status === 200) {
                const validData = Array.isArray(res.data) ? [...res.data] : [];

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
                        status: res.status ?? 500,
                        message: res.message || 'External error server'
                    },
                    pending: false
                }))
            }
        } catch (error) {
            setCourse((prev) => ({
                ...prev,
                error: {
                    status: 500,
                    message: error.message || 'Something is error, try again!'
                },
                pending: false
            }))
        }
    }

    useEffect(() => {
        getStateCourse();
        getCourse();
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
            const res = await GetContentLessonService({ course_id: params.course_id, lesson_id: data });
            if (res.status === 200) {
                setLesson((prev) => ({
                    ...prev,
                    data: res.data?.[0],
                }))
            }
            else {
                if (res.status === 501) {
                    setAlert({
                        status: 500,
                        message: res.message
                    })
                    setCourse((prev) => ({
                        ...prev,
                        module: lesson.data.module_id,
                        lesson: lesson.data.lesson_id
                    }))
                }
                else {
                    setLesson((prev) => ({
                        ...prev,
                        error: {
                            status: res.status ?? 500,
                            message: res.message || 'Something is error, try again!'
                        },
                    }))
                }
            }
        } catch (err) {
            setLesson((prev) => ({
                ...prev,
                error: {
                    status: 500,
                    message: err.message || 'External server error'
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
            const res = await UpdateLessonService({ course_id: params.course_id, lesson_id: lesson_id })
            if (res.status === 200) {
                await getCourse({ hasSubmit: true });
                setAlert({ status: res.status || 200, message: res.message || 'Congratulations, learn next lesson' })
            }
            else {
                setLesson((prev) => ({
                    ...prev,
                    handling: false
                }))
                setAlert({ status: res.status || 500, message: res.message || 'Something is wrong, try again' })
            }
        } catch (err) {
            setLesson((prev) => ({
                ...prev,
                handling: false
            }))
            setAlert({ status: 500, message: err.message || 'External server error' })
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

    useEffect(() => {
        setAlert(null)
    }, [alert])

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
                                            <p>{lesson.data.type}: {lesson.data.source}</p>
                                        </div>
                                        <footer className="footer_view">
                                            {
                                                lesson.data.status === 'In Progress'
                                                &&
                                                <button
                                                    id="confirm_lesson"
                                                    onClick={() => submitLesson({ lesson_id: lesson.data.lesson_id })}
                                                    disabled={lesson.handling}
                                                >
                                                    {
                                                        lesson.handling ?
                                                            <LoadingContent scale={0.5} color={'var(--color_white)'} />
                                                            :
                                                            <>
                                                                Done
                                                            </>
                                                    }
                                                </button>
                                            }
                                        </footer>
                                    </>
                                    :
                                    <p>Data can not be loaded</p>
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
                                                            style={course.module === item.id ? { height: `${item.lessons.length * 45 + (item.lessons.length - 1) * 5 + 20}px` } : { height: '0px' }}
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
                                                                                    'In Progress': { background: 'var(--color_blue_light)', color: 'var(--color_white)' },
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
                                        <p>No data can be shown here, try later!</p>
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

                                </>
                                :
                                <p>Data can not be loaded</p>
                    }
                </div>
            </div>
            <AlertPush
                message={alert?.message}
                status={alert?.status}
            />
        </div>
    )
}