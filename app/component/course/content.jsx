import { useState, useEffect, startTransition, useMemo, useRef } from "react"

import Form from "next/form";
import RegisterCourseService from "@/app/services/postService/registerCourseService";
import GetCourseService from "@/app/services/getService/courseService";

import { useQuery, useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import AlertPush from "../ui/alert";
import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { FaStar, FaArrowRight, FaRegCheckCircle } from "react-icons/fa";
import { IoFilter } from "react-icons/io5";
import { uniqWith, debounce } from "lodash";

export default function CourseContent({ redirect }) {
    const queryNavigate = useQuery();
    const { navigateToCourse } = useRouterActions();
    const ref = useRef(null);

    const filterValue = [
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
            name: 'price',
            items: [
                {
                    name: 'All',
                    value: null
                },
                {
                    name: 'Free',
                    value: false
                },
                {
                    name: 'Cost',
                    value: true
                }
            ]
        },
        {
            name: 'rating',
            items: [
                {
                    name: 'All',
                    value: null
                },
                {
                    name: '1',
                    value: 1
                },
                {
                    name: '2',
                    value: 2
                },
                {
                    name: '3',
                    value: 3
                },
                {
                    name: '4',
                    value: 4
                },
                {
                    name: '5',
                    value: 5
                },
            ]
        }
    ]

    const [state, setState] = useState({
        data: [],
        pending: true,
        idHandle: null,
        handling: false,
        error: null,
        filter: false,
        search: ''
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 20,
        registerCount: 0
    })

    const [filter, setFilter] = useState({
        price: null,
        level: null,
        rating: null,
    })

    const [alert, setAlert] = useState(null)

    const [apiQueue, setApiQueue] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)

    const { setRef } = useInfiniteScroll({
        hasMore: load.hasMore,
        onLoadMore: () => {
            if (!isProcessing && load.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        },
    });

    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        if (task.type === "fetch") {
            await fetchData();
        } else if (task.type === "register") {
            await task.execute()
        }

        setApiQueue((prev) => prev.slice(1));
        setIsProcessing(false);
    }

    useEffect(() => {
        processQueue();
    }, [apiQueue])

    const fetchData = async () => {
        if (!load.hasMore) return;
        try {
            const adjustedOffset = Math.max(0, load.offset - load.registerCount);
            const res = await GetCourseService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: filter });
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
                setAlert({ status: res.status, message: res.message || "Something is wrong" })
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || "Something is wrong" }, pending: false }))
            setAlert({ status: 500, message: err.message || "Something is wrong" })
        }
    }

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

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubmitSearch();
    }

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

        setState((prev) => ({
            ...prev,
            handling: true,
            idHandle: id,
        }));

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
                startTransition(() => {
                    setState((prev) => ({
                        ...prev,
                        handling: false,
                        idHandle: null,
                    }))
                    setAlert({
                        status: res?.status,
                        message: res?.message + course,
                        callback: () => {
                            navigateToCourse(id);
                            redirect()
                        }
                    });
                })
            } else {
                setState((prev) => ({
                    ...prev,
                    handling: false,
                    idHandle: null,
                }));
            }
        } catch (err) {
            setState((prev) => ({
                ...prev,
                handling: false,
                idHandle: null,
            }));
        }
    };


    const handleRedirect = () => {
        queryNavigate('/home', { name: 'course' });
        redirect();
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }))
        setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: false }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const handleDebounce = useMemo(() => {
        return debounce((value) => {
            setState(prev => ({ ...prev, search: value }))
        }, 500);
    }, [])

    useEffect(() => {
        return () => {
            handleDebounce.cancel();
        }
    }, [handleDebounce])


    const handleChange = (e) => {
        e.preventDefault();
        handleDebounce(e.target.value);
    }

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

    return (
        <div id='course'>
            <div className="heading-marketplace" >
                <Form className="input-search" onSubmit={handleSubmit}>
                    <input type="text" name="search" placeholder="Search course" onChange={handleChange} autoComplete="off" />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {
                        state.filter &&
                        <div className="table" ref={ref}>
                            <div className="content_table">
                                {
                                    filterValue.map((field, index) => (
                                        <div className="filter_value" key={index}>
                                            <span>{field.name}</span>
                                            {
                                                field.items.map((item, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        style={filter[field.name] === item.value ? { color: 'var(--color_white)', background: 'var(--color_black)' } : { color: 'var(--color_black)', background: 'var(--color_gray_light)' }}
                                                        onClick={() => setFilter((prev) => ({ ...prev, [field.name]: item.value }))}
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
                                <>
                                    {
                                        state.data.map((item, index) => (
                                            <div className="item" key={index}>
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
                                                    <div className="info">
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
                                                        onClick={() => handleRegister({ id: item.id, isCost: Math.round(item.cost) !== 0, course: item.title })}
                                                        style={{
                                                            backgroundColor: Math.round(item.cost) === 0 ? 'var(--color_blue)' : 'var(--color_black)'
                                                        }}
                                                        disabled={state.handling}
                                                    >
                                                        {state.idHandle === item.id ?
                                                            <LoadingContent scale={0.5} color="var(--color_white)" />
                                                            :
                                                            Math.round(item.cost) === 0 ? 'Learn' : item.cost
                                                        }
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    {
                                        (state.error && state.data.length > 0) &&
                                        <span className='load_wrapper'>
                                            <LoadingContent scale={0.5} message={"Something is wrong, try again"} />
                                        </span>
                                    }
                                </>
                                :
                                <p>No course found, please wait for the next update</p>
                }
            </div>
            {
                (!state.pending && !state.error) &&
                (
                    load.hasMore ?
                        <span ref={setRef} className="load_wrapper">
                            <LoadingContent scale={0.5} />
                        </span>
                        :
                        null
                )
            }
            <AlertPush
                status={alert?.status}
                message={alert?.message}
                callback={alert?.callback}
            />
        </div >
    )
}