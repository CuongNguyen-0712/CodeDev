import { useState, useEffect, useTransition } from "react"

import Link from "next/link"

import { useRouterActions } from "@/app/router/useRouterActions";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import { uniqWith } from "lodash";

import { api } from "@/app/lib/axios";

import { FaCartShopping, FaPlay, FaCode, FaGraduationCap } from "react-icons/fa6";
import { IoSettingsSharp, IoClose, IoTrashBin, IoReload, IoArchive } from "react-icons/io5";
import { MdCategory } from "react-icons/md";
import { GoHeartFill } from "react-icons/go";
import { BiDetail } from "react-icons/bi";
import { LuSearchX } from "react-icons/lu";
import { HiSparkles } from "react-icons/hi2";
import { VscDebugContinue } from "react-icons/vsc";

export function CourseItem({
    item,
    isHandling,
    onJoin,
    onWithdraw,
    setAlert,
}) {
    const levelMapping = {
        'beginner': 'Beginner',
        'intermediate': 'Intermediate',
        'advanced': 'Advanced',
        'expert': 'Expert',
        'master': 'Master'
    }

    const [openSetting, setOpenSetting] = useState(false)
    const [confirmWithdraw, setConfirmWithdraw] = useState(false)
    const [marked, setMarked] = useState(item.is_marked)

    const progressPercent = item.lessons > 0
        ? ((item.progress ?? 0) / item.lessons * 100).toFixed(0)
        : 0;

    const isArchived = progressPercent > 0

    const handleMarkedCourse = async ({ id, course }) => {
        const newMarked = !marked
        setMarked(newMarked)

        try {
            const response = await api.patch('update/updateStatusCourse', { id: id, marked: newMarked });
            if (response.data.success) {
                setAlert({ status: response.status, message: `${newMarked ? 'Marked' : 'Unmarked'} course: ${course} successfully` })
            }
            else {
                setAlert({ status: response.status, message: response.data?.message })
                setMarked(marked)
            }
        }
        catch (err) {
            setAlert({ status: err.response?.status || 500, message: err.response?.data?.message || `Failed to marked course: ${course}` })
            setMarked(marked)
        }
    }

    return (
        <div className="course-card">
            {/* Card Header */}
            <div className="card-header">
                <div className="course-icon">
                    <img
                        src={item.language_logo || '/image/static/no_image.png'}
                        alt={item.language_name || 'No Image'}
                        onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/image/static/no_image.png';
                        }}
                    />
                </div>
                <button
                    className={`bookmark-btn ${marked ? 'active' : ''}`}
                    disabled={isHandling}
                    onClick={(e) => {
                        e.stopPropagation()
                        setMarked(!marked)
                        handleMarkedCourse({ id: item.id, course: item.title })
                    }}
                >
                    <GoHeartFill fontSize={16} />
                </button>
            </div>

            {/* Card Body */}
            <div className="card-body">
                <h3 className="course-title">{item.title}</h3>
                <p className="course-concept">{item.concept}</p>

                <div className="course-meta">
                    <span className="meta-item level">
                        <FaGraduationCap />
                        {levelMapping[item.level] || '__'}
                    </span>
                    <span className="meta-item language">
                        <FaCode />
                        {item.language_name || '__'}
                    </span>
                    <span className="meta-item category">
                        <MdCategory />
                        {item.category_name || '__'}
                    </span>
                </div>

                {/* Progress */}
                <div className="course-progress">
                    <div className="progress-header">
                        <span className="progress-label">Progress</span>
                        <span className="progress-value">{progressPercent == 100 ? 'Completed' : `${progressPercent}%`}</span>
                    </div>
                    <div className="progress-bar">
                        <div
                            className="progress-fill"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <span className="progress-detail">{item.progress}/{item.lessons} lessons</span>
                </div>
            </div>

            {/* Card Footer */}
            <div className="card-footer">
                {openSetting ? (
                    <div className="setting-actions">
                        {
                            isArchived ?
                                <button
                                    className="btn_action btn-archived"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                    }}
                                >
                                    {isHandling ? (
                                        <LoadingContent scale={0.4} color={"var(--color_white)"} />
                                    ) : (
                                        <>
                                            <IoArchive />
                                            Archive
                                        </>
                                    )}
                                </button>
                                :
                                <button
                                    className="btn_action btn-withdraw"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setConfirmWithdraw(true)
                                    }}
                                >
                                    {isHandling ? (
                                        <LoadingContent scale={0.4} color={"var(--color_white)"} />
                                    ) : (
                                        <>
                                            <IoTrashBin />
                                            Withdraw
                                        </>
                                    )}
                                </button>
                        }
                        <button
                            className="btn-close"
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(false)
                                setConfirmWithdraw(false)
                            }}
                        >
                            <IoClose />
                        </button>
                    </div>
                ) : (
                    <div className="main-actions">
                        <button
                            className="btn-join"
                            disabled={isHandling}
                            onClick={(e) => {
                                e.stopPropagation()

                                if (item.lessons === 0) {
                                    setAlert({ status: 400, message: "This course has no lessons available yet." })
                                    return
                                }

                                onJoin(item.id)
                            }}
                        >
                            {isHandling ? (
                                <LoadingContent scale={0.4} color={"var(--color_white)"} />
                            ) : (
                                (() => {
                                    switch (parseInt(progressPercent)) {
                                        case 0:
                                            return (
                                                <>
                                                    <FaPlay />
                                                    Start
                                                </>
                                            )

                                        case 100:
                                            return (
                                                <>
                                                    <IoReload />
                                                    Review
                                                </>
                                            )

                                        default:
                                            return (
                                                <>
                                                    <VscDebugContinue />
                                                    Continue
                                                </>
                                            )
                                    }
                                })()
                            )}
                        </button>
                        <Link
                            href={`/course/${item.id}`}
                            className="btn-preview"
                        >
                            <BiDetail />
                        </Link>
                        <button
                            className="btn-settings"
                            disabled={isHandling}
                            onClick={(e) => {
                                e.stopPropagation()
                                setOpenSetting(true)
                            }}
                        >
                            <IoSettingsSharp />
                        </button>
                    </div>
                )}
            </div>

            {/* Confirm Withdraw Modal */}
            {confirmWithdraw && (
                <div className="confirm-modal">
                    {isHandling ? (
                        <LoadingContent scale={0.8} />
                    ) : (
                        <>
                            <div className="modal-content">
                                <span className="modal-icon">
                                    <IoTrashBin />
                                </span>
                                <h4>Withdraw Course</h4>
                                <p>Are you sure you want to withdraw <strong>{item.title}</strong>?</p>
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="btn-confirm"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onWithdraw({ id: item.id, course: item.title })
                                    }}
                                >
                                    Withdraw
                                </button>
                                <button
                                    className="btn-cancel"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setConfirmWithdraw(false)
                                    }}
                                >
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default function MyCourse({ alert }) {
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
            name: 'status',
            items: [
                {
                    name: 'Enrolled',
                    value: 'enrolled',
                },
                {
                    name: 'In Progress',
                    value: 'in_progress',
                },
                {
                    name: 'Completed',
                    value: 'completed',
                },
                {
                    name: 'Paused',
                    value: 'paused',
                },
                {
                    name: 'Dropped',
                    value: 'dropped',
                }
            ]
        },
        {
            name: "marked",
            items: [
                {
                    name: "Marked",
                    value: 'true',
                },
                {
                    name: "Unmarked",
                    value: 'false',
                }
            ]
        },
    ]

    const defaultFilter = {
        status: ['enrolled', 'in_progress'],
    }

    const [state, setState] = useState({
        data: [],
        search: '',
        filter: null,
        error: null,
        pending: true,
    })

    const [handlingMap, setHandlingMap] = useState({})

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 20,
        deletedCount: 0
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

    const handleNavigate = () => {
        navigate('/course');
    }
    const fetchData = async () => {
        if (!load.hasMore) return;

        setState(prev => ({ ...prev, error: null }));

        try {
            const adjustedOffset = Math.max(0, load.offset - load.deletedCount) || 0;
            const response = await api.get('get/getMyCourse', {
                params: {
                    search: state.search.trim(),
                    offset: adjustedOffset.toString(),
                    limit: load.limit,
                    markeds: state.filter?.marked,
                    statuses: state.filter?.status,
                    levels: state.filter?.level,
                },
            })
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
                setState((prev) => ({
                    ...prev,
                    error: {
                        status: response.status,
                        message: response.message
                    },
                    pending: false
                }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: err.response?.status || 500,
                    message: err.response?.data?.message || "Failed to load content, try again"
                },
                pending: false
            }))
        }
    }

    useEffect(() => {
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }, [])

    const handleWithdrawCourse = ({ id, course }) => {
        if (handlingMap[id]) return

        startHandling(id)

        setApiQueue(prev => [
            ...prev,
            {
                type: 'delete',
                execute: async () => {
                    try {
                        const response = await api.patch('update/updateWithdrawCourse', { id: id });

                        if (response.data.success) {
                            setLoad(prev => ({
                                ...prev,
                                deletedCount: prev.deletedCount + 1
                            }))

                            setState(prev => ({
                                ...prev,
                                data: prev.data.filter(item => item.id !== id)
                            }))

                            setApiQueue(prev => [...prev, { type: 'fetch' }])

                            alert(response.status, `Successfully withdraw course: ${course}`)
                        } else {
                            alert(response.status, `Failed to withdraw course: ${course}`)
                        }
                    } catch (err) {
                        alert(err.response?.status || 500, `Failed to withdraw course: ${course}`)
                    } finally {
                        stopHandling(id)
                    }
                }
            }
        ])
    }

    const handleSubmitSearch = () => {
        if (state.search.length > 0 && state.search.trim() === '') return

        if (load.hasSearch && state.search.trim() === '') {
            setState(prev => ({ ...prev, data: [], pending: true }));
            setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: false }));
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return;
        }

        setState(prev => ({ ...prev, data: [], pending: true }));
        setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: true }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    useEffect(() => {
        handleSubmitSearch();
    }, [state.search])

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }));
        setLoad({ offset: 0, hasMore: true });
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const handleJoin = (id) => {
        if (!id) return;
        startHandling(id);
        navigate(`/learning/${id}`);
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
        <div id="myCourse">
            {/* Page Header */}
            <div className="header-content">
                <div className="header-text">
                    <span className="header-label">
                        <HiSparkles />
                        Courses
                    </span>
                    <h1>My Learning </h1>
                    <p>Continue your learning journey and track progress</p>
                </div>
                <Link className="header-btn" id="marketplace_btn" href="/course">
                    <FaCartShopping />
                    <span>Courses Marketplace</span>
                </Link>
            </div>

            {/* Search & Filter */}
            <section className="course-search">
                <SearchBar
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    submit={handleSubmitSearch}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                    placeholderText="Search courses..."
                />
            </section>

            {/* Course Grid */}
            <section className="course-grid">
                {state.pending ? (
                    <LoadingContent />
                ) : state.error && state.data.length === 0 ? (
                    <ErrorReload data={state.error} refetch={refetchData} />
                ) : state.data && state.data.length > 0 ? (
                    state.data.map(item => (
                        <CourseItem
                            key={item.id}
                            item={item}
                            onJoin={handleJoin}
                            onWithdraw={handleWithdrawCourse}
                            setAlert={(data) => alert(data.status, data.message)}
                            isHandling={!!handlingMap[item.id]}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <LuSearchX />
                        <h4>No courses found</h4>
                        <p>Try adjusting your search or explore the marketplace</p>
                        <button onClick={handleNavigate}>
                            <FaCartShopping />
                            Browse Marketplace
                        </button>
                    </div>
                )}
            </section>

            {/* Load More */}
            {!state.pending && state.data.length > 0 && load.hasMore && (
                <div className="load-more" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={state.error && "Something went wrong, check your connection"}
                    />
                </div>
            )}
        </div>
    )
}