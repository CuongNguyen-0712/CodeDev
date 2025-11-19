import { useState, useEffect, startTransition, useMemo, useRef } from "react"

import Form from "next/form";

import DeleteMyCourseServive from "@/app/services/deleteService/myCourseService";
import GetMyCourseService from "@/app/services/getService/myCourseService";
import UpdateHideStatusCourseService from "@/app/services/updateService/hideStatusCourseService";

import { useRouterActions } from "@/app/router/router";
import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";
import AlertPush from '../ui/alert'

import { debounce, uniqWith } from "lodash";

import { FaCartShopping } from "react-icons/fa6";
import { IoFilter, IoSettingsSharp, IoClose, IoEyeOff, IoTrashBin, IoEye } from "react-icons/io5";
import { FaRegCheckCircle } from "react-icons/fa";

export default function MyCourse({ redirect }) {
    const { navigateToCourse } = useRouterActions();
    const ref = useRef(null)

    const filterValues = [
        {
            name: 'level',
            items: [
                {
                    name: 'All',
                    value: null
                },
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
                    name: 'All',
                    value: null
                },
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
                }
            ]
        },
        {
            name: "hide",
            items: [
                {
                    name: "None",
                    value: false,
                },
                {
                    name: 'Hidden',
                    value: true,
                }
            ]
        },
    ]

    const [state, setState] = useState({
        data: [],
        search: '',
        filter: false,
        idHandle: null,
        isHide: false,
        pending: true,
        error: null,
        handling: false,
        activeUI: false,
        idRedirect: null,
    })

    const [filter, setFilter] = useState({
        level: null,
        status: null,
        hide: false
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 10,
        deletedCount: 0
    })

    const [confirm, setConfirm] = useState({
        hide: false,
        withdraw: false,
    })

    const [apiQueue, setApiQueue] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [alert, setAlert] = useState(null)

    const { setRef } = useInfiniteScroll({
        hasMore: load.hasMore,
        onLoadMore: () => {
            if (!isProcessing && load.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        },
    });

    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0 || state.idRedirect) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        if (task.type === "fetch") {
            await fetchData();
        }
        else {
            await task.execute()
        }

        setApiQueue((prev) => prev.slice(1));
        setIsProcessing(false);
    }

    useEffect(() => {
        processQueue()
    }, [apiQueue])

    useEffect(() => {
        setState((prev) => ({ ...prev, isHide: filter.hide }))
    }, [state.pending])

    const handleNavigate = () => {
        redirect(true);
        navigateToCourse()
    }

    const fetchData = async () => {
        if (!load.hasMore) return;

        try {
            const adjustedOffset = Math.max(0, load.offset - load.deletedCount) || 0;
            const res = await GetMyCourseService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: filter });
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
                    message: err.message || "Failed to load content, try again"
                },
                pending: false
            }))
        }
    }

    const handleWithdrawCourse = async ({ id, course }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'delete',
                execute: async () => {

                    setState((prev) => ({ ...prev, handling: true }))

                    try {
                        const res = await DeleteMyCourseServive(id);
                        if (res.status == 200) {
                            setLoad((prev) => ({ ...prev, deletedCount: prev.deletedCount + 1 }));
                            setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== id) }));
                            setApiQueue((prev) => [...prev, { type: "fetch" }]);
                            startTransition(() => {
                                setAlert({
                                    status: res?.status,
                                    message: res?.message + ' course: ' + course,
                                });
                                setState((prev) => ({
                                    ...prev,
                                    handling: false,
                                    idHandle: null
                                }))
                            });
                        }
                        else {
                            setAlert({
                                status: res?.status,
                                message: res?.message + ' course: ' + course,
                            });
                            setState((prev) => ({
                                ...prev,
                                handling: false,
                            }))
                        }
                    }
                    catch (err) {
                        setAlert({
                            status: err?.status || 500,
                            message: err?.message || "Something is wrong, try again",
                        });
                        setState((prev) => ({
                            ...prev,
                            handling: false,
                        }))
                    }
                }
            }
        ])
    }

    const handleUpdateStatus = async ({ id, status, course }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'update',
                execute: async () => {

                    setState((prev) => ({ ...prev, handling: true }));

                    try {
                        const res = await UpdateHideStatusCourseService({ courseId: id, hide: status });
                        if (res.status == 200) {
                            setState((prev) => ({
                                ...prev,
                                data: prev.data.filter((item) => item.id != id),
                                idHandle: null
                            }));

                            startTransition(() => {
                                setAlert({
                                    status: res?.status,
                                    message: res?.message + ' course: ' + course,
                                });
                                setState((prev) => ({
                                    ...prev,
                                    handling: false,
                                    idHandle: null,
                                }))
                            })
                        }
                        else {
                            setAlert({
                                status: res?.status,
                                message: res?.message + ' course: ' + course,
                            });
                            setState((prev) => ({
                                ...prev,
                                handling: false
                            }))
                        }
                    }
                    catch (err) {
                        setAlert({
                            status: err?.status || 500,
                            message: err?.message || "Something is wrong, try again",
                        });
                        setState((prev) => ({
                            ...prev,
                            handling: false
                        }))
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
    }, [state.search]);

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubmitSearch();
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }));
        setLoad({ offset: 0, hasMore: true });
        startTransition(() => {
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
        })
    }

    const handleDebounce = useMemo(() =>
        debounce((value) => {
            setState((prev) => ({ ...prev, search: value }));
        }, 500)
        , []);

    useEffect(() => {
        return () => {
            handleDebounce.cancel();
        };
    }, [handleDebounce]);

    const handleChange = (e) => {
        e.preventDefault();
        handleDebounce(e.target.value);
    };

    const refTable = (e) => {
        if (!ref.current) return;

        if (ref.current && !ref.current.contains(e.target)) {
            setState(prev => ({ ...prev, filter: false }))
        }
    }

    useEffect(() => {
        document.addEventListener('click', refTable);
        return () => {
            document.removeEventListener('click', refTable);
        }
    }, [state.filter])

    const handleJoin = (id) => {
        if (!id) return;

        setState((prev) => ({ ...prev, idRedirect: id }));
        navigateToCourse(id);
    }

    useEffect(() => {
        setAlert(null)
    }, [alert])

    return (
        <div id="myCourse">
            <div className="heading-myCourse">
                <Form className="input-search" onSubmit={handleSubmit}>
                    <input type="text" name="search" placeholder="Search your course" autoComplete="off" onChange={handleChange} />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {state.filter &&
                        <div className="table" ref={ref}>
                            <div className="content_table">
                                {
                                    filterValues.map((field, index) => (
                                        <div className="filter_value" key={index}>
                                            <span>{field.name}</span>
                                            {
                                                field.items.map((item, index) => (
                                                    <button
                                                        type="button"
                                                        key={index}
                                                        onClick={() =>
                                                            setFilter((prev) => ({
                                                                ...prev,
                                                                [field.name]: item.value
                                                            }))
                                                        }
                                                        style={filter[field.name] === item.value ? { color: 'var(--color_white)', background: 'var(--color_black)' } : { color: 'var(--color_black)', background: 'var(--color_gray_light)' }}
                                                        disabled={state.pending}
                                                    >
                                                        {item.name}
                                                    </button>
                                                ))
                                            }
                                        </div>
                                    ))
                                }
                            </div>
                            <div className="footer_table">
                                <button type="submit" disabled={state.pending}>
                                    {
                                        state.pending ?
                                            <LoadingContent scale={0.5} color='var(--color_white)' />
                                            :
                                            <>
                                                <FaRegCheckCircle />
                                                Apply
                                            </>
                                    }
                                </button>
                            </div>
                        </div>
                    }
                </Form>
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
                        state.error ?
                            <ErrorReload data={state.error} refetch={refetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map((item) => (
                                    <div key={item.id} className="course">
                                        <div className="heading-course">
                                            <img src={item.image?.trim()} alt="course_image" />
                                            <h3>{item.title}</h3>
                                        </div>
                                        <div className="content-course">
                                            <div className="item">
                                                <h5>Concept</h5>
                                                <p>{item.concept}</p>
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
                                                <p>{((item.progress / item.lesson) * 100).toPrecision(3)}% ({item.progress}/{item.lesson})</p>
                                            </div>
                                        </div>
                                        <div className="footer-course">
                                            <button
                                                className="setting-course"
                                                onClick={() => {
                                                    setState((prev) => ({
                                                        ...prev,
                                                        idHandle: state.idHandle === item.id ? null : item.id
                                                    }))
                                                    setConfirm((prev) => ({
                                                        ...prev,
                                                        hide: false,
                                                        withdraw: false,
                                                    }))
                                                }}
                                                disabled={state.handling}
                                                style={{ cursor: state.handling ? 'not-allowed' : 'default' }}
                                            >
                                                {state.idHandle === item.id ? <IoClose /> : <IoSettingsSharp />}
                                            </button>
                                            {
                                                state.idHandle === item.id ?
                                                    <div className="setting-list">
                                                        <button
                                                            className='hide-course'
                                                            onClick={() => {
                                                                setConfirm((prev) => ({
                                                                    ...prev,
                                                                    hide: true
                                                                }))
                                                            }}
                                                            disabled={state.handling}
                                                        >
                                                            {
                                                                state.isHide ?
                                                                    <IoEye />
                                                                    :
                                                                    <IoEyeOff />
                                                            }
                                                        </button>
                                                        <button
                                                            className="cancel-course"
                                                            onClick={() => setConfirm((prev) => ({
                                                                ...prev,
                                                                withdraw: true
                                                            }))}
                                                            disabled={state.handling}
                                                        >

                                                            <IoTrashBin />
                                                            Withdraw
                                                        </button>
                                                    </div>
                                                    :
                                                    <button
                                                        className="join-course"
                                                        disabled={state.handling.withdraw || state.handling.hide || state.idRedirect}
                                                        onClick={() => handleJoin(item.id)}
                                                    >
                                                        {
                                                            state.idRedirect === item.id ?
                                                                <LoadingContent scale={0.5} color='var(--color_white)' />
                                                                :
                                                                <>
                                                                    Join
                                                                </>
                                                        }
                                                    </button>
                                            }
                                        </div>
                                        {
                                            ((confirm.hide || confirm.withdraw) && state.idHandle === item.id) &&
                                            <div className='form_confirm_course'>
                                                {
                                                    state.handling ?
                                                        <LoadingContent scale={0.8} />
                                                        :
                                                        <>
                                                            <div className="confirm_course_text">
                                                                {
                                                                    confirm.hide &&
                                                                    <>
                                                                        {
                                                                            state.isHide ?
                                                                                <>
                                                                                    <h4 className='hide_func'>Showing</h4>
                                                                                    <p>This action will show the course from your dashboard.</p>
                                                                                </>
                                                                                :
                                                                                <>
                                                                                    <h4 className='hide_func'>Hiding</h4>
                                                                                    <p>This action will hide the course from your dashboard.</p>
                                                                                </>
                                                                        }
                                                                    </>
                                                                }

                                                                {
                                                                    confirm.withdraw &&
                                                                    <>
                                                                        <h4 className='delete_func'>Withdrawing</h4>
                                                                        <p>The data will be lost if you withdraw from this course.</p>
                                                                    </>
                                                                }
                                                            </div>
                                                            <div className='confirm_course_btns'>
                                                                {
                                                                    confirm.hide &&
                                                                    <button
                                                                        className='handle_hide'
                                                                        onClick={() =>
                                                                            handleUpdateStatus({ id: item.id, status: !state.isHide, course: item.title })
                                                                        }
                                                                    >
                                                                        {
                                                                            state.isHide ?
                                                                                <>
                                                                                    Show
                                                                                </>
                                                                                :
                                                                                <>
                                                                                    Hide
                                                                                </>
                                                                        }
                                                                    </button>
                                                                }
                                                                {
                                                                    confirm.withdraw &&
                                                                    <button
                                                                        className='handle_withdraw'
                                                                        onClick={() =>
                                                                            handleWithdrawCourse({ id: item.id, course: item.title })
                                                                        }
                                                                    >
                                                                        Withdraw
                                                                    </button>
                                                                }
                                                                <button
                                                                    className="cancel_confirm_course"
                                                                    onClick={() => setConfirm({ hide: false, withdraw: false })}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </>
                                                }
                                            </div>
                                        }
                                    </div>
                                ))
                                :
                                <p>No course can be found here!</p>
                }
            </div>
            {!state.pending && !state.error && (
                load.hasMore ?
                    <span className="load_wrapper" ref={setRef}>
                        <LoadingContent scale={0.5} />
                    </span>
                    :
                    null
            )}

            <AlertPush
                message={alert?.message}
                status={alert?.status}
            />
        </div>
    )
}