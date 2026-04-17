import { useState, useEffect, startTransition } from "react"

import GetMyCourseService from "@/app/services/getService/myCourseService";
import UpdateWithdrawCourseService from "@/app/services/updateService/withdrawCourseService";
import UpdateMarkedCourseService from "@/app/services/updateService/markedCourseService";

import { useRouterActions } from "@/app/router/router";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import SearchBar from "../ui/searchBar";

import { uniqWith } from "lodash";

import { FaCartShopping, FaPlay, FaCode, FaGraduationCap } from "react-icons/fa6";
import { IoSettingsSharp, IoClose, IoTrashBin } from "react-icons/io5";
import { GoHeartFill } from "react-icons/go";
import { LuSearchX, LuExternalLink } from "react-icons/lu";
import { HiSparkles } from "react-icons/hi2";

export function CourseItem({
    item,
    isHandling,
    onPreview,
    onJoin,
    onWithdraw,
    setAlert,
}) {
    const [openSetting, setOpenSetting] = useState(false)
    const [confirmWithdraw, setConfirmWithdraw] = useState(false)
    const [marked, setMarked] = useState(item.is_marked)

    const progressPercent = item.lessons > 0
        ? ((item.progress ?? 0) / item.lessons * 100).toFixed(0)
        : 0;

    const handleMarkedCourse = async ({ id, course }) => {
        const newMarked = !marked
        setMarked(newMarked)

        try {
            const res = await UpdateMarkedCourseService({ courseId: id, marked: newMarked });
            if (res.status == 200) {
                setAlert({ status: res.status, message: `${newMarked ? 'Marked' : 'Unmarked'} course: ${course} successfully` })
            }
            else {
                setAlert({ status: res.status, message: res.message || `Failed to marked course: ${course}` })
                setMarked(marked)
            }
        }
        catch (err) {
            setAlert({ status: err.status || 500, message: `Failed to marked course: ${course} ( Internal server error )` })
            setMarked(marked)
        }
    }


    return (
        <div className="course-card">
            {/* Card Header */}
            <div className="card-header">
                <div className="course-icon">
                    <img src={item.image?.trim()} alt="course_image" />
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
                        {item.level}
                    </span>
                    <span className="meta-item language">
                        <FaCode />
                        {item.language}
                    </span>
                </div>

                {/* Progress */}
                <div className="course-progress">
                    <div className="progress-header">
                        <span className="progress-label">Progress</span>
                        <span className="progress-value">{progressPercent}%</span>
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
                        <button
                            className="btn-withdraw"
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
                                <>
                                    {
                                        item.progress > 0 ?
                                            <>
                                                <FaPlay />
                                                Continue
                                            </>
                                            :
                                            <>
                                                <FaPlay />
                                                Start
                                            </>
                                    }
                                </>
                            )}
                        </button>
                        <button
                            className="btn-preview"
                            onClick={(e) => {
                                e.stopPropagation()
                                onPreview(item.id)
                            }}
                        >
                            <LuExternalLink />
                        </button>
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

export default function MyCourse({ redirect, alert }) {
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
            name: 'status',
            items: [
                {
                    name: 'Enrolled',
                    value: 'Enrolled',
                },
                {
                    name: 'In Progress',
                    value: 'In Progress',
                },
                {
                    name: 'Completed',
                    value: 'Completed',
                },
                {
                    name: 'Cancelled',
                    value: 'Cancelled',
                },
                {
                    name: 'Refunded',
                    value: 'Refunded',
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
        status: ['Enrolled', 'In Progress', 'Completed'],
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
        navigateToCourse()
        redirect(true);
    }
    const fetchData = async () => {
        if (!load.hasMore) return;

        setState(prev => ({ ...prev, error: null }));

        try {
            const adjustedOffset = Math.max(0, load.offset - load.deletedCount) || 0;
            const res = await GetMyCourseService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: state.filter ?? {} });
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
                setState((prev) => ({
                    ...prev,
                    error: {
                        status: res.status,
                        message: res.message
                    },
                    pending: false
                }))
            }
        }
        catch (err) {
            setState((prev) => ({
                ...prev,
                error: {
                    status: err.status || 500,
                    message: "Failed to load content, try again"
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
                        const res = await UpdateWithdrawCourseService(id)

                        if (res.status === 200) {
                            setLoad(prev => ({
                                ...prev,
                                deletedCount: prev.deletedCount + 1
                            }))

                            setState(prev => ({
                                ...prev,
                                data: prev.data.filter(item => item.id !== id)
                            }))

                            setApiQueue(prev => [...prev, { type: 'fetch' }])

                            alert(res.status, `Successfully withdraw course: ${course}`)
                        } else {
                            alert(res.status, res.message || `Failed to withdraw course: ${course}`)
                        }
                    } catch (err) {
                        alert(err.status || 500, `Failed to withdraw course: ${course} ( Internal server error )`)
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
        startTransition(() => {
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
        })
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
        navigateToLearning(id);
        redirect(true);
    }

    const handlePreview = (id) => {
        redirect(true)
        navigateToCourse(id);
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
            <section className="course-header">
                <div className="header-content">
                    <div className="header-text">
                        <span className="header-label">
                            <HiSparkles />
                            My Learning
                        </span>
                        <h1>My Courses</h1>
                        <p>Continue your learning journey and track progress</p>
                    </div>
                    <button className="btn-marketplace" onClick={handleNavigate}>
                        <FaCartShopping />
                        <span>Browse Marketplace</span>
                    </button>
                </div>
            </section>

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
                            onPreview={handlePreview}
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