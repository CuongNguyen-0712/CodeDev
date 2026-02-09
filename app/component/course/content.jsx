import { useState, useEffect } from "react"

import RegisterCourseService from "@/app/services/postService/registerCourseService";
import GetCourseService from "@/app/services/getService/courseService";

import { useQuery, useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import AlertPush from "../ui/alert";
import Search from "../ui/search";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { uniqWith } from "lodash";

import { FaStar, FaArrowRight } from "react-icons/fa";
import { CgDetailsMore } from "react-icons/cg";

const CourseItem = ({ item, handlePreview, handleRegister, startHandling, isHandling }) => {
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

    return (
        <div
            className="course_item"
        >
            <div className="heading">
                <img src={item.image?.trim()} alt="course_image" />
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
                <div
                    className="info"
                    style={{ 'color': `${colorLevelMap[item.level].color}` }}
                >
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
                    className="submit_course"
                    onClick={(e) => {
                        e.stopPropagation()

                        if (Math.round(item.cost) !== 0) return

                        startHandling(item.id)
                        handleRegister({
                            id: item.id,
                            isCost: Math.round(item.cost) !== 0,
                            course: item.title
                        })
                    }}
                    disabled={isHandling}
                    style={{
                        backgroundColor:
                            Math.round(item.cost) === 0
                                ? 'var(--color_blue)'
                                : 'var(--color_black)'
                    }}
                >
                    {isHandling ? (
                        <LoadingContent scale={0.5} color="var(--color_white)" />
                    ) : (
                        Math.round(item.cost) === 0 ? 'Learn' : item.cost
                    )}
                </button>
                <button
                    className="more_detail"
                    disabled={isHandling}
                    onClick={() => handlePreview(item.id)}
                >
                    <CgDetailsMore fontSize={20} />
                </button>
            </div>
        </div>
    )
}


export default function CourseContent({ redirect }) {
    const queryNavigate = useQuery();
    const { navigateToLearning, navigateToCourse } = useRouterActions();

    const filterMapping = [
        {
            name: 'level',
            items: [
                {
                    name: 'Beginner',
                    value: 'Beginner'
                },
                {
                    name: 'Intermediate',
                    value: 'Intermediate'
                },
                {
                    name: 'Advanced',
                    value: 'Advanced'
                },
                {
                    name: 'Expert',
                    value: 'Expert'
                },
                {
                    name: 'Master',
                    value: 'Master'
                }
            ]
        },
        {
            name: 'price',
            items: [
                {
                    name: 'Free',
                    value: 'false'
                },
                {
                    name: 'Cost',
                    value: 'true'
                }
            ]
        },
        {
            name: 'rating',
            items: [
                {
                    name: '1',
                    value: '1'
                },
                {
                    name: '2',
                    value: '2'
                },
                {
                    name: '3',
                    value: '3'
                },
                {
                    name: '4',
                    value: '4'
                },
                {
                    name: '5',
                    value: '5'
                },
            ]
        }
    ]

    const defaultFilter = {
        price: ['false']
    }

    const [state, setState] = useState({
        data: [],
        pending: true,
        error: null,
        filter: null,
        search: ''
    })

    const [handlingMap, setHandlingMap] = useState({})

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        limit: 20,
        registerCount: 0
    })

    const [alert, setAlert] = useState(null)

    const [apiQueue, setApiQueue] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)

    const { setRef } = useInfiniteScroll({
        hasMore: load.hasMore,
        onLoadMore: () => {
            if (load.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        },
    });

    useEffect(() => {
        if (isProcessing || apiQueue.length === 0) return;

        const run = async () => {
            setIsProcessing(true);

            const task = apiQueue[0];

            if (task.type === "fetch") {
                await fetchData();
            } else {
                await task.execute();
            }

            setApiQueue(prev => prev.slice(1));
            setIsProcessing(false);
        };

        run();
    }, [apiQueue, isProcessing]);

    const fetchData = async () => {
        if (!load.hasMore) return;

        setState(prev => ({ ...prev, error: null }));

        try {
            const adjustedOffset = Math.max(0, load.offset - load.registerCount);
            const res = await GetCourseService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: state.filter ?? {} });
            if (res.status === 200) {
                setLoad((prev) => ({
                    ...prev,
                    hasMore: res.data.length >= load.limit,
                    offset: prev.offset + prev.limit
                }))
                setState((prev) => ({
                    ...prev,
                    data: uniqWith([...prev.data, ...res.data], (a, b) => a.id === b.id),
                    pending: false
                }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message || "Something is wrong" }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: err.status || 500,
                    message: "Internal server error"
                },
                pending: false
            }))
        }
    }

    useEffect(() => {
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }, [])

    const handleSubmitSearch = () => {
        if (state.search.length > 0 && state.search.trim() === '') return;

        if (load.hasSearch && state.search.trim() === '') {
            setLoad((prev) => ({ ...prev, offset: 0, hasMore: true }));
            setState(prev => ({ ...prev, data: [], pending: true }));
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return
        }

        setState(prev => ({ ...prev, data: [], pending: true }));
        setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: true }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    useEffect(() => {
        handleSubmitSearch();
    }, [state.search])

    const handleRegister = ({ id, isCost, course }) => {
        if (isCost) return

        setApiQueue((prev) => [
            ...prev,
            {
                type: "register",
                execute: () => handleRequest({ id, course })
            }
        ]);
    }

    const handleRequest = async ({ id, course }) => {
        try {
            const res = await RegisterCourseService(id);
            if (res.status === 200) {
                setLoad((prev) => ({
                    ...prev,
                    registerCount: prev.registerCount + 1,
                }));
                setState((prev) => ({
                    ...prev,
                    data: prev.data.filter((item) => item.id !== id),
                }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                setAlert({
                    status: res?.status,
                    message: res?.message + course,
                    callback: () => {
                        navigateToLearning(id);
                        redirect()
                    }
                });
            } else {
                setAlert({
                    status: res?.status,
                    message: "Failed to register course: " + res?.message
                });
            }
        } catch (err) {
            setAlert({
                status: err.status || 500,
                message: "Failed to register course: Internal server error"
            });
        } finally {
            stopHandling(id);
        }
    };

    const handlePreview = (id) => {
        if (state.handling) return;
        redirect()
        navigateToCourse(id);
    }

    const handleRedirect = () => {
        queryNavigate('/home', { tab: 'learning' });
        redirect();
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, pending: true }))
        setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: false, registerCount: 0 }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const startHandling = (id) => {
        setHandlingMap(prev => ({ ...prev, [id]: true }))
    }

    const stopHandling = (id) => {
        setHandlingMap(prev => {
            const rest = { ...prev }
            delete rest[id]
            return rest
        })
    }

    return (
        <div id='course'>
            <div className="heading-marketplace" >
                <Search
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    submit={() => handleSubmitSearch()}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                />
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
                        (state.error && state.data.length === 0) ?
                            <ErrorReload data={state.error} refetch={refetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map(item => (
                                    <CourseItem
                                        key={item.id}
                                        item={item}
                                        handlePreview={handlePreview}
                                        handleRegister={handleRegister}
                                        startHandling={startHandling}
                                        isHandling={!!handlingMap[item.id]}
                                    />
                                ))
                                :
                                <p className="no_data">
                                    No course found, please wait for the next update !
                                </p>
                }
            </div>
            {!state.pending && state.data.length > 0 && load.hasMore && (
                <span className="load_wrapper" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={state.error && "Something is wrong, check your connection"}
                    />
                </span>
            )}
            <AlertPush
                status={alert?.status}
                message={alert?.message}
                callback={alert?.callback}
            />
        </div >
    )
}