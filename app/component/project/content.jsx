'use client'
import { useState, useEffect } from "react"

import GetProjectService from "@/app/services/getService/projectService";
import PostRegisterProjectService from "@/app/services/postService/registerProjectService";

import { useQuery } from "@/app/router/router";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import Search from "../ui/searchBar";
import AlertPush from "../ui/alert";

import { uniqWith } from "lodash";

import { FaArrowRight, FaChevronDown, FaUsers, FaUser } from "react-icons/fa";
import { HiOutlineClipboardDocumentList } from "react-icons/hi2";

const statusConfig = {
    'Open': {
        color: "#10b981",
        bg: "rgba(16, 185, 129, 0.1)",
    },
    'Closed': {
        color: "#f43f5e",
        bg: "rgba(244, 63, 94, 0.1)",
    },
    'Coming soon': {
        color: "#f97316",
        bg: "rgba(249, 115, 22, 0.1)",
    },
};

const difficultyConfig = {
    'Beginner': { color: "#10b981", bg: "rgba(16, 185, 129, 0.1)" },
    'Intermediate': { color: "#3b82f6", bg: "rgba(59, 130, 246, 0.1)" },
    'Advanced': { color: "#f97316", bg: "rgba(249, 115, 22, 0.1)" },
    'Expert': { color: "#ef4444", bg: "rgba(239, 68, 68, 0.1)" },
    'Master': { color: "#8b5cf6", bg: "rgba(139, 92, 246, 0.1)" },
};

export function ProjectItem({
    item,
    isHandling,
    onRegister,
}) {
    const [expanded, setExpanded] = useState(false)

    const renderButtonText = () => {
        if (item.status === 'Closed') return "Closed";
        if (item.status === 'Coming soon') return "Coming Soon";
        return isHandling ? (
            <LoadingContent scale={0.5} color="var(--color_white)" />
        ) : (
            <>
                {
                    item.is_deleted ?
                        "Restore"
                        :
                        item.method === 'Self' ?
                            "Join Project"
                            :
                            "Add to Team"
                }
                <FaArrowRight fontSize={12} />
            </>
        );
    };

    return (
        <div className="project-card">
            <div className="card-header">
                <span
                    className="status-badge"
                    style={{
                        background: statusConfig[item.status]?.bg,
                        color: statusConfig[item.status]?.color,
                    }}
                >
                    {item.status}
                </span>
                <span className="method-badge">
                    {item.method === 'Self' ? <FaUser /> : <FaUsers />}
                    {item.method}
                </span>
            </div>

            <h3 className="card-title">{item.name}</h3>
            <p className="card-description">{item.description}</p>

            <div className="card-meta">
                <div className="meta-item">
                    <span className="meta-label">Instructor</span>
                    <span className="meta-value">{item.instructor}</span>
                </div>
                <div className="meta-item">
                    <span className="meta-label">Difficulty</span>
                    <span
                        className="difficulty-badge"
                        style={{
                            color: difficultyConfig[item.difficulty]?.color,
                            background: difficultyConfig[item.difficulty]?.bg,
                        }}
                    >
                        {item.difficulty}
                    </span>
                </div>
            </div>

            <div className={`requirements-section ${expanded ? "expanded" : ""}`}>
                <button
                    type="button"
                    className="requirements-toggle"
                    onClick={() => setExpanded(!expanded)}
                >
                    <HiOutlineClipboardDocumentList />
                    <span>Requirements</span>
                    <FaChevronDown className="toggle-icon" />
                </button>
                <div className="requirements-content">
                    <p>{item.requirements}</p>
                </div>
            </div>

            <button
                className={`action-btn ${item.status !== 'Open' ? 'disabled' : ''}`}
                disabled={isHandling || item.status !== 'Open'}
                onClick={() => {
                    onRegister({ id: item.id, name: item.name })
                }}
            >
                {renderButtonText()}
            </button>
        </div>
    );
}

export default function ProjectContent({ redirect }) {
    const queryNavigate = useQuery();

    const filterMapping = [
        {
            name: 'status',
            items: [
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
            name: 'method',
            items: [
                {
                    name: 'Self',
                    value: 'Self'
                },
                {
                    name: 'Team',
                    value: 'Team'
                }
            ]
        }
    ]

    const defaultFilter = {
        status: ['Open']
    }

    const [state, setState] = useState({
        data: [],
        error: null,
        pending: true,
        search: '',
        filter: null,
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 20,
        countRequest: 0
    })

    const [handlingMap, setHandlingMap] = useState({})
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
            const adjustedOffset = Math.max(0, load.offset - load.countRequest);
            const res = await GetProjectService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: state.filter ?? {} });
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
            setState((prev) => ({ ...prev, error: { status: err.status || 500, message: 'External server error' }, pending: false }));
        }
    }

    useEffect(() => {
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }, [])

    const handleRegister = ({ id, name }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: "register",
                execute: () => handleRequest({ id, name })
            }
        ]);
    }

    const handleRequest = async ({ id, name }) => {
        if (!id) return;

        startHandling(id);

        try {
            const res = await PostRegisterProjectService({ projectId: id });
            if (res.status === 200) {
                setLoad((prev) => ({
                    ...prev,
                    countRequest: prev.countRequest + 1
                }))
                setState((prev) => ({
                    ...prev,
                    data: prev.data.filter((item) => item.id !== id)
                }));
                setAlert({
                    status: res.status,
                    message: `Register project successfully: ${name}`
                })
            }
            else {
                setAlert({
                    status: res.status,
                    message: `Register project failed: ${name}`
                })
            }
        }
        catch (err) {
            setAlert({
                status: err.status || 500,
                message: "Internal server error"
            })
        } finally {
            stopHandling(id);
        }
    }

    const refetchData = () => {
        setState(prev => ({ ...prev, pending: true }))
        setLoad(prev => ({ ...prev, offset: 0, hasMore: true, hasSearch: false, countRequest: 0 }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    const handleRedirect = () => {
        queryNavigate('home', { tab: 'project' });
        redirect(true)
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
        <div id="project-marketplace">
            <header className="project-header">
                <Search
                    data={filterMapping}
                    submit={handleSubmitSearch}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    pending={state.pending}
                    defaultFilter={defaultFilter}
                />
                <button className="back-btn" onClick={handleRedirect}>
                    <span>Back</span>
                    <FaArrowRight />
                </button>
            </header>

            <div className="projects-grid">
                {state.pending ? (
                    <LoadingContent />
                ) : state.error ? (
                    <ErrorReload
                        data={state.error}
                        refetch={refetchData}
                    />
                ) : state.data && state.data.length > 0 ? (
                    state.data.map((item, index) => (
                        <ProjectItem
                            key={item.id || index}
                            item={item}
                            isHandling={!!handlingMap[item.id]}
                            onRegister={handleRegister}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <HiOutlineClipboardDocumentList />
                        <p>No projects found</p>
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

            <AlertPush
                message={alert?.message}
                status={alert?.status}
                reset={() => setAlert(null)}
            />
        </div>
    )
}