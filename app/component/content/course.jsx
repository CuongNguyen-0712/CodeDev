import { useState, useEffect, startTransition } from "react"

import GetMyCourseService from "@/app/services/getService/myCourseService";
import UpdateWithdrawCourseService from "@/app/services/updateService/withdrawCourseService";
import UpdateMarkedCourseService from "@/app/services/updateService/markedCourseService";

import { useRouterActions } from "@/app/router/router";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import AlertPush from '../ui/alert'
import Search from "../ui/search";

import { uniqWith } from "lodash";

import { FaCartShopping } from "react-icons/fa6";
import { IoSettingsSharp, IoClose, IoTrashBin } from "react-icons/io5";
import { GoHeartFill } from "react-icons/go";
import { LuSearchX } from "react-icons/lu";
import { BsThreeDots } from "react-icons/bs";

export function CourseItem({
    item,
    isHandling,
    onPreview,
    onJoin,
    onWithdraw,
    onMarked
}) {
    const [openSetting, setOpenSetting] = useState(false)
    const [confirmWithdraw, setConfirmWithdraw] = useState(false)

    const [marked, setMarked] = useState(item.is_marked)

    return (
        <div
            className="course"
        >
            <div className="heading-course">
                <img src={item.image?.trim()} alt="course_image" />
                <h3>{item.title}</h3>
            </div>

            <div className="content-course">
                <div className="item">
                    <h5>Concept</h5>
                    <p>{item.concept}</p>
                    <button
                        className="detail_more"
                        onClick={(e) => {
                            e.stopPropagation()
                            onPreview(item.id)
                        }}
                    >
                        <BsThreeDots fontSize={20} />
                    </button>
                </div>
                <div className="item">
                    <h4>Level:</h4>
                    <p>{item.level}</p>
                </div>
                <div className="item">
                    <h4>Language:</h4>
                    <p>{item.language}</p>
                </div>
                <div className="item">
                    <h4>Progress:</h4>
                    <p>
                        {((item.progress / item.lesson) * 100).toPrecision(3)}%
                        ({item.progress}/{item.lesson})
                    </p>
                </div>
            </div>

            <div className="footer_course">
                <button
                    className="setting_course"
                    disabled={isHandling}
                    onClick={(e) => {
                        e.stopPropagation()
                        setOpenSetting(prev => !prev)
                        setConfirmWithdraw(false)
                    }}
                >
                    {openSetting ? <IoClose /> : <IoSettingsSharp />}
                </button>

                {openSetting ?
                    <div className="setting_list">
                        <button
                            className="withdraw_course"
                            disabled={isHandling}
                            onClick={(e) => {
                                e.stopPropagation()
                                setConfirmWithdraw(true)
                            }}
                        >
                            {
                                confirmWithdraw ?
                                    <LoadingContent scale={0.5} color={"var(--color_white)"} />
                                    :
                                    <>
                                        <IoTrashBin />
                                        Withdraw
                                    </>
                            }
                        </button>
                        <button
                            className="marked_course"
                            disabled={isHandling}
                            onClick={(e) => {
                                e.stopPropagation()
                                setMarked(!marked)
                                onMarked({ id: item.id, status: !marked, course: item.title })
                            }}
                        >
                            <GoHeartFill
                                fontSize={20}
                                color={marked ? "var(--color_orange)" : "var(--color_gray)"}
                            />
                        </button>
                    </div>
                    :
                    <>
                        <button
                            className="join_course"
                            disabled={isHandling}
                            onClick={(e) => {
                                e.stopPropagation()
                                onJoin(item.id)
                            }}
                        >
                            {
                                isHandling ?
                                    <LoadingContent scale={0.5} color={"var(--color_white)"} />
                                    :
                                    <>
                                        Join
                                    </>
                            }
                        </button>
                    </>
                }
            </div>

            {confirmWithdraw && (
                <div className="form_confirm_course">
                    {isHandling ?
                        <LoadingContent scale={0.8} />
                        :
                        <>
                            <div className="confirm_course_text">
                                <h4 className="delete_func">Withdrawing</h4>
                                <p>
                                    Are you sure to withdraw course <strong>{item.title}</strong> from your learning ?
                                </p>
                            </div>

                            <div className="confirm_course_btns">
                                <button
                                    className="handle_withdraw"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onWithdraw({
                                            id: item.id,
                                            course: item.title
                                        })
                                    }}
                                >
                                    Withdraw
                                </button>

                                <button
                                    className="cancel_confirm_course"
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
                    }
                </div>
            )}
        </div>
    )
}

export default function MyCourse({ redirect }) {
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
    const [alert, setAlert] = useState(null)

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
        redirect(true);
        navigateToCourse()
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

                            startTransition(() => {
                                setAlert({
                                    status: res.status,
                                    message: `Withdraw course: ${course}`
                                })
                            })
                        } else {
                            setAlert({
                                status: res.status,
                                message: `Failed to withdraw course: ${course} ( ${res.message || "Something is error"} )`
                            })
                        }
                    } catch (err) {
                        setAlert({
                            status: err?.status || 500,
                            message: 'Something is wrong, try again'
                        })
                    } finally {
                        stopHandling(id)
                    }
                }
            }
        ])
    }


    const handleMarkedCourse = async ({ id, course, status }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'marked',
                execute: async () => {

                    try {
                        const res = await UpdateMarkedCourseService({ courseId: id, marked: status });
                        if (res.status == 200) {
                            setAlert({
                                status: res?.status,
                                message: `${status ? 'Marked' : 'Unmarked'} course: ` + course,
                            });
                            setApiQueue((prev) => [...prev, { type: "fetch" }]);
                        }
                        else {
                            setAlert({
                                status: res?.status,
                                message: 'Failed to marked course: ' + course + ` ( ${res?.message || "Something is error"} )`,
                            });
                        }
                    }
                    catch (err) {
                        setAlert({
                            status: err?.status || 500,
                            message: "Failed to marked course: " + course + ' ( Internal server error )',
                        })
                    } finally {
                        stopHandling(id)
                    }
                }
            }])
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

    useEffect(() => {
        setAlert(null)
    }, [alert])

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
            <div className="heading-myCourse">
                <Search
                    data={filterMapping}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    submit={handleSubmitSearch}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                />
                <div className="handle-course">
                    <button onClick={handleNavigate} id="course-btn">
                        <FaCartShopping fontSize={16} />
                        <span>
                            Marketplace
                        </span>
                    </button>
                </div>
            </div>
            <div className="course-frame">
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
                                        onPreview={handlePreview}
                                        onJoin={handleJoin}
                                        onWithdraw={handleWithdrawCourse}
                                        onMarked={handleMarkedCourse}
                                        isHandling={!!handlingMap[item.id]}
                                    />
                                ))
                                :
                                <p className='no_data'>
                                    <LuSearchX fontSize={18} />
                                    No course can be found here !
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
                message={alert?.message}
                status={alert?.status}
            />
        </div >
    )
}