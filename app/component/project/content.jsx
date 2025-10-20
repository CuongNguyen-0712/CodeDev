import { useState, useEffect, startTransition, useMemo, useRef } from "react"

import GetProjectService from "@/app/services/getService/projectService";
import PostRegisterProjectService from "@/app/services/postService/registerProjectService";

import Form from "next/form";
import { ErrorReload } from "../ui/error";
import { useQuery } from "@/app/router/router";
import { uniqWith, debounce } from "lodash";
import { LoadingContent } from "../ui/loading";

import { IoFilter } from "react-icons/io5"
import { FaArrowRight, FaRegCheckCircle, FaChevronUp } from "react-icons/fa";
import { FaUser, FaUserGroup } from "react-icons/fa6";
import { MdPushPin, MdInfoOutline } from "react-icons/md";

export default function ProjectContent({ redirect }) {
    const queryNavigate = useQuery();
    const ref = useRef(null)

    const filterValue = [
        {
            name: 'status',
            items: [
                {
                    name: 'All',
                    value: null
                },
                {
                    name: 'Comming soon',
                    value: 'Comming soon'
                },
                {
                    name: 'Closed',
                    value: 'Closed'
                },
                {
                    name: 'Open',
                    value: 'Open'
                }
            ]
        },
        {
            name: 'difficulty',
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
        }
    ]

    const colorUI = {
        'Open': {
            color: 'var(--color_blue)',
            opacity: 'rgba(30, 144, 255, 0.2)'
        },
        'Closed': {
            color: 'var(--color_red_light)',
            opacity: 'rgba(255, 0, 0, 0.2)'
        },
        'Comming soon': {
            color: 'var(--color_orange)',
            opacity: 'rgba(255, 255, 0, 0.2)'
        }
    }

    const [state, setState] = useState({
        data: {
            self: [],
            team: [],
        },
        error: null,
        handling: false,
        idHandle: null,
        message: null,
        pending: true,
        search: '',
        filter: false
    })

    const [offset, setOffset] = useState({
        self: 0,
        team: 0
    });

    const [hasMore, setHasMore] = useState({
        self: true,
        team: true
    });

    const [registerCount, setRegisterCount] = useState({
        self: 0,
        team: 0
    })

    const [isLoading, setIsLoading] = useState({
        self: false,
        team: false
    })

    const [load, setLoad] = useState({
        hasSearch: false,
        limit: 5,
    })

    const [hide, setHide] = useState({
        self: false,
        team: false
    })

    const [filter, setFilter] = useState({
        status: 'Open',
        difficulty: null,
    })

    const [apiQueue, setApiQueue] = useState([])
    const [isProcessing, setIsProcessing] = useState(false)

    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        if (task.type === "fetch") {
            await fetchData({ method: task.method });
        }
        else if (task.type === 'register') {
            await task.execute()
        }
        else {
            return;
        }

        setApiQueue((prev) => prev.slice(1));
        setIsProcessing(false);
    }

    useEffect(() => {
        processQueue();
    }, [apiQueue])

    const fetchData = async ({ offsetValue = 0, method } = {}) => {
        if (method && !hasMore[method]) return;

        try {
            const adjustedOffset = Math.max(0, (method ? offset[method] : offsetValue) - (registerCount[method] || 0));
            const res = await GetProjectService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), method: method ? method.charAt(0).toUpperCase() + method.slice(1) : method, search: state.search, filter: filter });

            if (res.status === 200) {
                if (method) {
                    setOffset((prev) => ({
                        ...prev,
                        [method]: prev[method] + load.limit,
                    }))
                    setHasMore((prev) => ({
                        ...prev,
                        [method]: res.data.length >= load.limit
                    }))
                    setIsLoading((prev) => ({
                        ...prev,
                        [method]: false
                    }))
                    setState((prev) => ({
                        ...prev,
                        data: {
                            ...prev.data,
                            [method]: uniqWith([...prev.data[method], ...res.data], (a, b) => a.id === b.id)
                        },
                        pending: false
                    }));
                }
                else {
                    const self = [...res.data].filter((item) => item.method === 'Self')
                    const team = [...res.data].filter((item) => item.method === 'Team')
                    setOffset((prev) => ({
                        ...prev,
                        self: prev.self + load.limit,
                        team: prev.team + load.limit
                    }))
                    setHasMore((prev) => ({
                        ...prev,
                        self: self.length >= load.limit,
                        team: team.length >= load.limit
                    }))
                    setState((prev) => ({
                        ...prev,
                        data: {
                            self: uniqWith([...prev.data?.self ?? [], ...self], (a, b) => a.id === b.id),
                            team: uniqWith([...prev.data?.team ?? [], ...team], (a, b) => a.id === b.id)
                        },
                        pending: false
                    }));
                }
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message || 'Something is wrong' }, pending: false }));
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const handleDropdown = (e) => {
        const target = e.currentTarget.closest('div')?.className;
        if (target.includes('active')) {
            e.currentTarget.closest('div').classList.remove('active');
        }
        else {
            e.currentTarget.closest('div').classList.add('active');
        }
    }

    const handleRegister = ({ id, method }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: "register",
                execute: () => handleRequest({ id, method })
            }
        ]);
    }

    const handleRequest = async ({ id, method }) => {
        if (!id || method === 'team') return;

        setState((prev) => ({ ...prev, handling: true, idHandle: id }))

        try {
            const res = await PostRegisterProjectService({ projectId: id });
            if (res.status === 200) {
                setRegisterCount((prev) => ({
                    ...prev,
                    [method]: prev[method] + 1
                }));
                setState((prev) => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [method]: prev.data[method].filter((item) => item.id !== id)
                    }
                }));
                setApiQueue((prev) => [...prev, { type: "fetch", method: method }]);
                startTransition(() => {
                    setState((prev) => ({ ...prev, message: { status: res.status, data: res.message || 'Successfully' }, handling: false, idHandle: null }));
                })
            }
            else {
                setState((prev) => ({ ...prev, message: { status: res.status, data: res.message || 'Something is wrong' }, handling: false, idHandle: null }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, message: { status: 500, data: err.message || 'Something is wrong' }, handling: false, idHandle: null }));
        }
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, error: null, pending: true }))
        setIsLoading({
            self: false,
            team: false
        })
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const handleRedirect = () => {
        queryNavigate('home', { name: 'project' });
        redirect()
    }

    const handleShowMore = (value) => {
        setIsLoading((prev) => ({
            ...prev,
            [value]: true
        }))
        setApiQueue((prev) => [
            ...prev,
            {
                type: "fetch",
                method: value
            }
        ]);
    }


    const handleSubmitSearch = () => {
        if (state.search.length > 0 && state.search.trim() === '') return;

        if (load.hasSearch && state.search.trim() === '') {
            setState(prev => ({ ...prev, data: { ...state.data, self: [], team: [] }, pending: true }));
            setOffset((prev) => ({ ...prev, self: 0, team: 0 }));
            setHasMore({ self: true, team: true });
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return
        }

        setState(prev => ({ ...prev, data: { ...state.data, self: [], team: [] }, pending: true }));
        setOffset((prev) => ({ ...prev, self: 0, team: 0 }));
        setHasMore({ self: true, team: true });
        setLoad(prev => ({ ...prev, hasSearch: state.search.trim().length > 0 }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    useEffect(() => {
        handleSubmitSearch();
    }, [state.search])

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubmitSearch();
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
        <div id="project">
            <div className="heading_project">
                <Form className="input-search" onSubmit={handleSubmit}>
                    <input type="text" placeholder="Search project" name="search" autoComplete="off" onChange={handleChange} />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {state.filter &&
                        <div className="table" ref={ref}>
                            <div className="content_table">
                                {
                                    filterValue.map((field, index) => (
                                        <div className="filter_value" key={index}>
                                            <span>
                                                {field.name}
                                            </span>
                                            {
                                                field.items.map((item, index) => (
                                                    <button
                                                        key={index}
                                                        type="button"
                                                        style={filter[field.name] === item.value ? { color: 'var(--color_white)', background: 'var(--color_black)' } : { color: 'var(--color_black)', background: 'var(--color_gray_light)' }}
                                                        onClick={() => setFilter((prev) => ({ ...prev, [field.name]: item.value }))}
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
                    <button className="back_btn" onClick={handleRedirect}>
                        <h4>
                            Back
                        </h4>
                        <FaArrowRight />
                    </button>
                </div>
            </div>
            <div className="content_project">
                <div className="method_project">
                    <div className="heading">
                        <button
                            className='handle_method_btn'
                            onClick={() => setHide((prev) => ({ ...prev, self: !prev.self }))}
                            style={
                                hide.self ?
                                    {
                                        background: 'var(--color_blue)',
                                        borderColor: 'var(--color_white)',
                                        color: 'var(--color_white)'
                                    }
                                    :
                                    {
                                        background: 'var(--color_gray_light)',
                                        borderColor: 'var(--color_gray)',
                                        color: 'var(--color_black)'
                                    }
                            }
                        >
                            <FaChevronUp
                                fontSize={15}
                                style={{ transform: hide.self ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s all ease' }}
                            />
                            <FaUser
                                fontSize={15}
                            />
                        </button>
                        <button className="tag_method">
                            <MdInfoOutline fontSize={20} />
                        </button>
                    </div>
                    {
                        !hide.self ?
                            <>
                                <div className="content">
                                    {
                                        state.pending ?
                                            <LoadingContent />
                                            :
                                            state.error ?
                                                <p>Something is wrong</p>
                                                :
                                                state.data.self && state.data.self.length > 0 ? (
                                                    state.data.self.map((item, index) => (
                                                        <div className="item" key={index}>
                                                            <div className="heading_item">
                                                                <span
                                                                    style={{ background: colorUI[item.status].opacity, color: colorUI[item.status].color }}
                                                                >
                                                                    {item.status}
                                                                </span>
                                                                <h4>{item.name}</h4>
                                                            </div>
                                                            <div className="content_item">
                                                                <p>{item.description}</p>
                                                                <div className="info">
                                                                    <h5>Instructor:</h5>
                                                                    <p>{item.instructor}</p>
                                                                </div>
                                                                <div className="info_dropdown">
                                                                    <button onClick={handleDropdown}>
                                                                        <MdPushPin />
                                                                        Requirements
                                                                    </button>
                                                                    <p>
                                                                        {item.requirements}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="footer_item">
                                                                <div className="info">
                                                                    <h5>Difficulty:</h5>
                                                                    <p>{item.difficulty}</p>
                                                                </div>
                                                                <button
                                                                    style={{ background: colorUI[item.status].color }}
                                                                    disabled={item.status !== 'Open' || state.handling}
                                                                    onClick={() => handleRegister({ id: item.id, method: 'self' })}
                                                                >
                                                                    {
                                                                        (() => {
                                                                            switch (item.status) {
                                                                                case 'Open':
                                                                                    return state.idHandle === item.id ?
                                                                                        <LoadingContent scale={0.5} color="var(--color_white)" />
                                                                                        :
                                                                                        <>Join</>;
                                                                                case 'Closed':
                                                                                    return <>Closed</>;
                                                                                case 'Comming soon':
                                                                                    return <>Comming soon...</>;
                                                                                default:
                                                                                    return <>Something wrong</>;
                                                                            }
                                                                        })()
                                                                    }
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )
                                                    :
                                                    <p>No project can be found !</p>
                                    }
                                </div>
                                {
                                    (!state.pending && !state.error) &&
                                    <div className="show_more" style={{ display: !hasMore.self && 'none' }}>
                                        <button disabled={isLoading.self} onClick={() => handleShowMore('self')}>
                                            {
                                                isLoading.self ?
                                                    <LoadingContent scale={0.5} color="var(--color_white)" />
                                                    :
                                                    <>
                                                        See more
                                                    </>
                                            }
                                        </button>
                                    </div>
                                }
                            </>
                            :
                            null
                    }
                </div>
                <div className="method_project">
                    <div className="heading">
                        <button
                            className="handle_method_btn"
                            onClick={() => setHide((prev) => ({ ...prev, team: !prev.team }))}
                            style={
                                hide.team ?
                                    {
                                        background: 'var(--color_blue)',
                                        borderColor: 'var(--color_white)',
                                        color: 'var(--color_white)'
                                    }
                                    :
                                    {
                                        background: 'var(--color_gray_light)',
                                        borderColor: 'var(--color_gray)',
                                        color: 'var(--color_black)'
                                    }
                            }
                        >
                            <FaChevronUp
                                fontSize={15}
                                style={{ transform: hide.team ? 'rotate(180deg)' : 'rotate(0deg)', transition: '0.2s all ease' }}
                            />
                            <FaUserGroup
                                fontSize={15}
                            />
                        </button>
                        <button className="tag_method">
                            <MdInfoOutline fontSize={20} />
                        </button>
                    </div>
                    {
                        !hide.team ?
                            <>
                                <div className="content">
                                    {
                                        state.pending ?
                                            <LoadingContent />
                                            :
                                            state.error ?
                                                <p>Something is wrong</p>
                                                :
                                                state.data.team && state.data.team.length > 0 ? (
                                                    state.data.team.map((item, index) => (
                                                        <div className="item" key={index}>
                                                            <div className="heading_item">
                                                                <span
                                                                    style={{ background: colorUI[item.status].opacity, color: colorUI[item.status].color }}
                                                                >
                                                                    {item.status}
                                                                </span>
                                                                <h4>{item.name}</h4>
                                                            </div>
                                                            <div className="content_item">
                                                                <p>{item.description}</p>
                                                                <div className="info">
                                                                    <h5>Instructor:</h5>
                                                                    <p>{item.instructor}</p>
                                                                </div>
                                                                <div className="info_dropdown">
                                                                    <button onClick={handleDropdown}>
                                                                        <MdPushPin />
                                                                        Requirements
                                                                    </button>
                                                                    <p>{item.requirements}</p>
                                                                </div>
                                                            </div>
                                                            <div className="footer_item">
                                                                <div className="info">
                                                                    <h5>Difficulty:</h5>
                                                                    <p>{item.difficulty}</p>
                                                                </div>
                                                                <button
                                                                    style={{ background: colorUI[item.status].color }}
                                                                    disabled={item.status !== 'Open' || state.handling}
                                                                    onClick={() => handleRegister({ id: item.id, method: 'team' })}
                                                                >
                                                                    {
                                                                        (() => {
                                                                            switch (item.status) {
                                                                                case 'Open':
                                                                                    return state.idHandle === item.id ?
                                                                                        <LoadingContent scale={0.5} color="var(--color_white)" />
                                                                                        :
                                                                                        <>Add</>;
                                                                                case 'Closed':
                                                                                    return <>Closed</>;
                                                                                case 'Comming soon':
                                                                                    return <>Comming soon...</>;
                                                                                default:
                                                                                    return <>Something wrong</>;
                                                                            }
                                                                        })()
                                                                    }
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))
                                                )
                                                    :
                                                    <p>No project can be found !</p>

                                    }
                                </div>
                                {
                                    (!state.pending && !state.error) &&
                                    <div className="show_more" style={{ display: !hasMore.team && 'none' }}>
                                        <button disabled={isLoading.team} onClick={() => handleShowMore('team')}>
                                            {
                                                isLoading.team ?
                                                    <LoadingContent scale={0.5} color="var(--color_white)" />
                                                    :
                                                    <>
                                                        See more
                                                    </>
                                            }
                                        </button>
                                    </div>
                                }
                            </>
                            :
                            null
                    }
                </div>
                {
                    state.error && <ErrorReload data={state.error} refetch={refetchData} />
                }
            </div>
        </div >
    )
}