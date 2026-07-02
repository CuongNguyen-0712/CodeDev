'use client'
import { useState, useEffect, useRef } from "react"

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
    const { navigateBack, navigate } = useRouterActions();

    const scrollRef = useRef(null);

    const [state, setState] = useState({
        data: {},
        pending: true
    })

    const [mapping, setMapping] = useState({})

    const [slider, setSlider] = useState(true)
    const [view, setView] = useState(false)
    const { showAlert: alert } = useApp();

    const [course, setCourse] = useState({
        module: null,
        lesson: null,
        pending: true,
        error: null,
    })

    const [lesson, setLesson] = useState({
        data: null,
        error: null,
    })

    const [selectedData, setSelectedData] = useState(null)
    const [submiting, setSubmitting] = useState(false)
    const [redirect, setRedirect] = useState(false)

    const getStateCourse = async () => {
        try {
            const response = await api.get(`/get/getStateCourse`, {
                params: { courseId: params.course_id }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data[0] : {};

                if (!data || Object.values(data).length === 0) {
                    setState((prev) => ({ ...prev, pending: false }));
                    return;
                }

                setState((prev) => ({ ...prev, data, pending: false }));
            } else {
                alert(response.status, response.data?.message || 'Failed to load course data.');
                setState((prev) => ({ ...prev, pending: false }));
            }
        } catch (err) {
            alert(err.response?.status || 500, err.response?.data?.message || 'External server error');
            setState((prev) => ({ ...prev, pending: false }));
        }
    }


    const getCourse = async ({ hasSubmit = false } = {}) => {
        try {
            const response = await api.get('get/getContentCourse', {
                params: { courseId: params.course_id }
            });

            if (response.data.success) {
                const validData = Array.isArray(response.data.data) ? response.data.data : [];

                if (validData.length === 0) {
                    setCourse((prev) => ({ ...prev, pending: false }));
                    return;
                }

                const data = (hasSubmit
                    ? validData.find((item) => item.status === 'in_progress')
                    : validData.slice().sort((a, b) => new Date(b.last_at) - new Date(a.last_at))[0]) ?? validData.at(-1);


                if (!data) {
                    setCourse((prev) => ({ ...prev, pending: false }));
                    return;
                }

                const map = validData.reduce((acc, { module_id, module_title, module_index, ...rest }) => {
                    if (!acc[module_id]) {
                        acc[module_id] = { index: module_index, id: module_id, title: module_title, lessons: [], is_continue: validData.some(item => item.module_id === module_id && item.status === 'in_progress') };
                    }
                    acc[module_id].lessons.push(rest);
                    return acc;
                }, {});


                if (Object.keys(map).length === 0) {
                    setCourse((prev) => ({ ...prev, pending: false }));
                    return;
                }

                setCourse((prev) => ({
                    ...prev,
                    module: data.module_id,
                    lesson: data.lesson_id,
                    pending: false
                }));

                const result = Object.values(map)
                    .map((module) => ({
                        ...module,
                        lessons: module.lessons.sort(
                            (a, b) => a.lesson_index - b.lesson_index
                        )
                    }))
                    .sort((a, b) => a.index - b.index);

                setMapping(result);

                if (data.lesson_id === null) {
                    await getContentLesson(data.lesson_id);
                } else {
                    setSelectedData({
                        lesson_id: data.lesson_id,
                        module_id: data.module_id
                    });
                }
            } else {
                setCourse((prev) => ({
                    ...prev,
                    error: {
                        status: response.status ?? 500,
                        message: response.data?.message || 'Failed to load course content'
                    },
                    pending: false
                }));
            }
        } catch (error) {
            setCourse((prev) => ({
                ...prev,
                error: {
                    status: error.response?.status ?? 500,
                    message: error.response?.data?.message || 'Failed to load course'
                },
                pending: false
            }));
        }
    }

    useEffect(() => {
        if (!params.course_id) return;

        Promise.all([getCourse(), getStateCourse()]);
    }, [])

    const getContentLesson = async (lessonId) => {
        if (!lessonId) return;

        try {
            const response = await api.get('get/getContentLesson', {
                params: { courseId: params.course_id, lessonId }
            });
            if (response.data.success) {
                const lessonData = Array.isArray(response.data.data) ? response.data.data[0] : {};

                if (!lessonData) {
                    setLesson((prev) => ({ ...prev, pending: false }));
                    return;
                }

                setLesson((prev) => ({ ...prev, data: lessonData, pending: false }));
            } else {
                setLesson((prev) => ({
                    ...prev,
                    error: {
                        status: response.status ?? 500,
                        message: response.data?.message || 'Failed to load lesson'
                    },
                }));
            }
        } catch (err) {
            setLesson((prev) => ({
                ...prev,
                error: {
                    status: err.response?.status ?? 500,
                    message: err.response?.data?.message || 'Failed to load lesson content'
                },
            }));
        }
    }

    const submitLesson = async (lesson_id) => {
        if (!lesson_id) return;

        setSubmitting(true);

        try {
            const response = await api.patch('update/updateLesson', {
                courseId: params.course_id,
                lessonId: lesson_id
            });
            if (response.data.success) {
                alert(200, 'Congratulations! You have successfully completed this lesson.');
                await getCourse({ hasSubmit: true });
            } else {
                alert(response.status, response.data?.message || 'Failed to mark lesson as done');
            }
        } catch (err) {
            alert(err.response?.status ?? 500, err.response?.data?.message || 'Failed to submit lesson');
        } finally {
            setSubmitting(false);
        }
    }

    const refreshGetCourse = () => {
        setCourse((prev) => ({ ...prev, error: null, pending: true }));
        getCourse();
    };

    const refreshGetLesson = () => {
        setLesson((prev) => ({ ...prev, error: null, pending: true }));
        if (selectedData?.lesson_id) getContentLesson(selectedData.lesson_id);
    };

    const redirectToDetailCourse = ({ id }) => {
        if (!id) return;

        setRedirect(true)
        navigate(`/course/${id}`)
    }

    useEffect(() => {
        if (!selectedData?.lesson_id) return;

        if (scrollRef.current) {
            scrollRef.current.scrollTo({
                top: 0,
                behavior: 'smooth'
            })
        }
        getContentLesson(selectedData?.lesson_id);

    }, [selectedData]);

    return (
        <div id="course_page_layout">
            <nav className="nav_layout_params">
                <div className="nav_layout_heading">
                    <button onClick={navigateBack}>
                        <FaAngleLeft fontSize={20} color="var(--color_white)" />
                    </button>
                    <img
                        src={state.data?.language_logo || '/image/static/no_image.png'}
                        alt={state.data?.title || 'Course'}
                        width={40}
                        height={40}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/image/static/no_image.png';
                        }}
                    />
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
                    <div id="view" ref={scrollRef}>
                        {
                            lesson?.error ?
                                <ErrorReload data={lesson.error} refetch={refreshGetLesson} />
                                :
                                <LessonPage
                                    id={lesson.data?.source}
                                    status={lesson.data?.status === 'in_progress'}
                                    submit={() => submitLesson(selectedData?.lesson_id)}
                                    handling={submiting}
                                />
                        }
                    </div>
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
                                                    <section key={index} className={`module ${course.module === item.id ? 'target' : ''} ${item.is_continue && course.module !== item.id ? 'continue' : ''} ${selectedData?.module_id === item.id && course.module !== item.id ? 'selected' : ''}`}>
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
                                                                        className={`lesson ${selectedData?.lesson_id === lesson.lesson_id ? 'target' : ''}`}
                                                                    >
                                                                        <span
                                                                            className="target_lesson"
                                                                            style={{
                                                                                ...{
                                                                                    'enrolled': { background: 'var(--color_gray_light)', color: 'var(--color_black)' },
                                                                                    'in_progress': { background: 'var(--color_primary)', color: 'var(--color_white)' },
                                                                                    'completed': { background: 'var(--color_green)', color: 'var(--color_white)' },
                                                                                }[lesson.status]
                                                                            }}
                                                                        >
                                                                            <FaCheck fontSize={14} />
                                                                        </span>
                                                                        <button
                                                                            className="lesson_title"
                                                                            disabled={lesson.status === 'enrolled'}
                                                                            onClick={() => setSelectedData(prev => ({ ...prev, lesson_id: lesson.lesson_id, module_id: item.id }))}
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
                            (state.data && Object.values(state.data).length > 0) ?
                                <>
                                    <div className="view_course">
                                        <img
                                            src={state.data?.language_logo || '/image/static/no_image.png'}
                                            alt={state.data?.title || 'Course'}
                                            height={100}
                                            width={100}
                                            onError={(e) => {
                                                e.target.onerror = null;
                                                e.target.src = '/image/static/no_image.png';
                                            }}
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