'use client'
import { useState, useEffect } from "react"

import Link from "next/link";

import { api } from "@/app/lib/axios";

import { useRouterActions } from "@/app/router/useRouterActions";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import Search from "../ui/searchBar";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { useApp } from "@/app/contexts/appContext";

import { uniqWith } from "lodash";

import { FaStar, FaArrowLeft, FaUser, FaBookOpen, FaCode, FaCoins } from "react-icons/fa";
import { BiDetail } from "react-icons/bi";
import { MdCategory } from "react-icons/md";

const levelMapping = {
    'beginner': {
        tag: 'Beginner',
        color: 'var(--color_green)',
        bg: 'rgba(34, 197, 94, 0.1)',
    },
    'intermediate': {
        tag: 'Intermediate',
        color: 'var(--color_primary)',
        bg: 'rgba(48, 102, 190, 0.1)',
    },
    'advanced': {
        tag: 'Advanced',
        color: 'var(--color_orange)',
        bg: 'rgba(245, 158, 11, 0.1)',
    },
    'expert': {
        tag: 'Expert',
        color: 'var(--color_purple)',
        bg: 'rgba(168, 85, 247, 0.1)',
    },
    'master': {
        tag: 'Master',
        color: 'var(--color_red_dark)',
        bg: 'rgba(239, 68, 68, 0.1)',
    }
}

const CourseItem = ({ item, handlePreview, handleRegister, startHandling, isHandling }) => {
    const level = levelMapping[item.level] || levelMapping['beginner']
    const cost = Number(item.cost);
    const points = Number(item.points);

    return (
        <div className="course-card">
            <div className="course-card-header">
                <img
                    src={item.image || '/image/static/no_image.png'}
                    alt={item.title}
                    className="placeholder-image"
                    loading="lazy"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />

                <img
                    src={item.language_logo || '/image/static/no_image.png'}
                    alt={item.title}
                    height={60}
                    width={60}
                    className="language-logo"
                    onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/image/static/no_image.png';
                    }}
                />

                <div className="course-rating">
                    <FaStar className="star-icon" />
                    <span>{item.rating}</span>
                </div>

                <div
                    className="course-level"
                    style={{
                        color: level.color,
                        background: level.bg
                    }}
                >
                    {level.tag}
                </div>
            </div>

            <div className="course-card-body">
                <h3 className="course-title">{item.title}</h3>
                <p className="course-properties">{`${item.modules} modules - ${item.lessons} lessons - ${item.duration} minutes`}</p>
                <div className="course-meta">
                    <Link href={'#'} className="meta-item language">
                        <FaCode />
                        <span>{item.language_name}</span>
                    </Link>
                    <Link href={'#'} className="meta-item category">
                        <MdCategory />
                        <span>{item.category_name}</span>
                    </Link>
                    <Link href={'#'} className="meta-item instructor">
                        <FaUser />
                        <span>{item.instructor}</span>
                    </Link>
                </div>
            </div>

            <div className="course-card-footer">
                {
                    points > 0 && (
                        <div className="course-points">
                            <FaCoins fontSize={14} color="var(--color_yellow)" />
                            <span>{points}</span>
                        </div>
                    )
                }
                <button
                    className={`course-enroll-btn ${cost > 0 ? 'paid' : ''}`}
                    onClick={(e) => {
                        e.stopPropagation()
                        if (cost > 0) return
                        startHandling(item.id)
                        handleRegister({
                            id: item.id,
                            isCost: cost > 0,
                            course: item.title
                        })
                    }}
                    disabled={isHandling}
                >
                    {isHandling ? (
                        <LoadingContent scale={0.5} color="var(--color_white)" />
                    ) : (
                        cost === 0 ? 'Enroll Free' : `$${cost.toFixed(2)}`
                    )}
                </button>
                <button
                    className="course-detail-btn"
                    disabled={isHandling}
                    onClick={() => handlePreview(item.id)}
                    title="View Details"
                >
                    <BiDetail fontSize={18} />
                </button>
            </div>
        </div>
    )
}


export default function CourseContent() {
    const { showAlert } = useApp();
    const { navigate } = useRouterActions();

    const filterMapping = [
        {
            name: 'level',
            items: [
                {
                    name: 'Beginner',
                    value: 'beginner'
                },
                {
                    name: 'Intermediate',
                    value: 'intermediate'
                },
                {
                    name: 'Advanced',
                    value: 'advanced'
                },
                {
                    name: 'Expert',
                    value: 'expert'
                },
                {
                    name: 'Master',
                    value: 'master'
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
                    name: 'Paid',
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
            const response = await api.get('get/getCourse', {
                params: {
                    search: state.search.trim(),
                    limit: load.limit,
                    offset: adjustedOffset.toString(),
                    prices: state.filter?.price,
                    levels: state.filter?.level,
                    ratings: state.filter?.rating
                }
            });
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];
                setLoad((prev) => ({
                    ...prev,
                    hasMore: data.length >= load.limit,
                    offset: prev.offset + prev.limit
                }))
                setState((prev) => ({
                    ...prev,
                    data: uniqWith([...prev.data, ...data], (a, b) => a.id === b.id),
                    pending: false
                }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: response.status, message: response.data.message || "Something is wrong" }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: err.response?.status || 500,
                    message: err.response?.data?.message || "Internal server error"
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
        if (!id) return
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
            const response = await api.post('post/postRegisterCourse', { id: id });
            if (response.data.success) {
                setLoad((prev) => ({
                    ...prev,
                    registerCount: prev.registerCount + 1,
                }));
                setState((prev) => ({
                    ...prev,
                    data: prev.data.filter((item) => item.id !== id),
                }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                showAlert(200, `Successfully registered course: ${course}`, () => navigate({ path: `learning/${id}` }));
            } else {
                showAlert(response.status, response.data?.message || `Failed to register course: ${course}`);
            }
        } catch (err) {
            showAlert(err.response?.status || 500, err.response?.data?.message || `An error occurred while registering course: ${course}`);
        } finally {
            stopHandling(id);
        }
    };

    const handlePreview = (id) => {
        if (state.handling) return;
        navigate({ path: `course/${id}` });
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
        <section id="course-marketplace">
            <div className="marketplace-header">
                <Search
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    submit={() => handleSubmitSearch()}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                />
                <Link href="/home?tab=learning" className="my-courses-link">
                    <FaArrowLeft />
                    <span>Learning</span>
                </Link>
            </div>

            <div className="courses-grid">
                {state.pending ? (
                    <LoadingContent />
                ) : (state.error && state.data.length === 0) ? (
                    <ErrorReload data={state.error} refetch={refetchData} />
                ) : state.data && state.data.length > 0 ? (
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
                ) : (
                    <div className="empty-state">
                        <div className="empty-icon">
                            <FaBookOpen />
                        </div>
                        <h3>No courses found</h3>
                        <p>Please wait for the next update or try a different search</p>
                    </div>
                )}
            </div>

            {!state.pending && state.data.length > 0 && load.hasMore && (
                <div className="load-more-wrapper" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={state.error && "Something is wrong, check your connection"}
                    />
                </div>
            )}
        </section>
    )
}