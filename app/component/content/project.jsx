import { useState, useEffect, startTransition } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";
import UpdateHideStatusProjectService from "@/app/services/updateService/hideStatusProjectService";

import { useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import SearchBar from "../ui/searchBar";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { uniqWith } from "lodash";

import { FaRegTrashAlt, FaPlus } from "react-icons/fa";
import { FaUserGroup, FaUser, FaArrowRight, FaFolderOpen, FaCalendarDays } from "react-icons/fa6";
import { HiSparkles } from "react-icons/hi2";
import { VscProject } from "react-icons/vsc";

export function ProjectItem({
    item,
    isHandling,
    onDelete
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    const statusConfig = {
        'Completed': { color: 'var(--color_green)', bg: 'rgba(16, 185, 129, 0.1)' },
        'Ongoing': { color: 'var(--color_primary)', bg: 'rgba(48, 102, 190, 0.1)' },
        'Not Started': { color: 'var(--color_red)', bg: 'rgba(244, 63, 94, 0.1)' },
        'Pending': { color: 'var(--color_orange)', bg: 'rgba(249, 115, 22, 0.1)' },
    };

    const currentStatus = statusConfig[item.status] || statusConfig['Pending'];

    return (
        <div className="project-card">
            {/* Card Header */}
            <div className="card-header">
                <div className="project-icon" style={{ '--status-color': currentStatus.color, '--status-bg': currentStatus.bg }}>
                    <VscProject />
                </div>
                <div className="project-method">
                    {item.method === "Self" ? <FaUser /> : <FaUserGroup />}
                    <span>{item.method}</span>
                </div>
            </div>

            {/* Card Body */}
            <div className="card-body">
                <h3 className="project-title">{item.name}</h3>
                <p className="project-desc">{item.description}</p>

                <div className="project-meta">
                    <span
                        className="meta-status"
                        style={{ '--status-color': currentStatus.color, '--status-bg': currentStatus.bg }}
                    >
                        <span className="status-dot" />
                        {item.status}
                    </span>
                    {item.created_at && (
                        <span className="meta-date">
                            <FaCalendarDays />
                            {new Date(item.created_at).toLocaleDateString()}
                        </span>
                    )}
                </div>
            </div>

            {/* Card Footer */}
            <div className="card-footer">
                <button className="btn-open">
                    <FaArrowRight />
                    <span>Open Project</span>
                </button>
                <button
                    className="btn-delete"
                    disabled={isHandling}
                    onClick={(e) => {
                        e.stopPropagation();
                        setConfirmDelete(true);
                    }}
                >
                    <FaRegTrashAlt />
                </button>
            </div>

            {/* Confirm Delete Modal */}
            {confirmDelete && (
                <div className="confirm-modal">
                    {isHandling ? (
                        <LoadingContent scale={0.8} />
                    ) : (
                        <>
                            <div className="modal-content">
                                <span className="modal-icon delete">
                                    <FaRegTrashAlt />
                                </span>
                                <h4>Delete Project</h4>
                                <p>Are you sure you want to delete <strong>{item.name}</strong>?</p>
                            </div>
                            <div className="modal-actions">
                                <button
                                    className="btn-confirm"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDelete({ id: item.id, project: item.name });
                                    }}
                                >
                                    Delete
                                </button>
                                <button
                                    className="btn-cancel"
                                    disabled={isHandling}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmDelete(false);
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
    );
}

export default function Project({ redirect, alert }) {
    const { navigateToProject } = useRouterActions();

    const filterMapping = [
        {
            name: 'status',
            items: [
                { name: 'Pending', value: 'Pending' },
                { name: 'Ongoing', value: 'Ongoing' },
                { name: 'Completed', value: 'Completed' },
                { name: 'Not Started', value: 'Not Started' }
            ]
        },
        {
            name: 'method',
            items: [
                { name: 'Self', value: 'Self' },
                { name: 'Team', value: 'Team' }
            ]
        }
    ]

    const defaultFilter = {
        method: ['Self']
    }
    const [state, setState] = useState({
        data: [],
        pending: true,
        message: null,
        error: null,
        search: '',
        filter: null,
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 10,
        deletedCount: 0
    })

    const [handlingMap, setHandlingMap] = useState({})

    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const { setRef } = useInfiniteScroll({
        hasMore: load.hasMore,
        onLoadMore: () => {
            if (
                load.hasMore) {
                setApiQueue((prev) => [
                    ...prev,
                    { type: "fetch" }
                ])
            }
        },
    });

    const fetchData = async () => {
        if (!load.hasMore) return

        try {
            const adjustedOffset = Math.max(0, load.offset - load.deletedCount);
            const res = await MyProjectService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: state.filter ?? {} });
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
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: err.status || 500, message: "External server error, try again" }, pending: false }));
        }
    }

    const executeDelete = async ({ id, project }) => {
        if (!id) return

        startHandling(id);

        try {

            const res = await DeleteMyProjectService(id);

            if (res.status === 200) {
                setLoad((prev) => ({ ...prev, deletedCount: prev.deletedCount + 1 }));
                setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== id) }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                startTransition(() => {
                    alert(res.status, "Project " + project + " has been deleted successfully");
                })
            }
            else {
                alert(res.status || 500, "An error occurred while deleting project: " + project);
            }
        }
        catch (err) {
            alert(err.status || 500, err.message || "An error occurred while deleting project: " + project);
        } finally {
            stopHandling(id);
        }
    }

    const handleDelete = ({ id, project }) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: "delete",
                execute: () => executeDelete({ id, project })
            }
        ])
    }

    const executeMarked = async (data) => {
        const { id, hide } = data

        if (!id) return;

        setState(prev => ({ ...prev, handling: { ...prev.handling, hide: true } }));

        try {
            const res = await UpdateHideStatusProjectService({ projectId: id, hide: hide });
            if (res.status === 200) {
                setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== id) }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                startTransition(() => {
                    setConfirm((prev) => ({
                        ...prev,
                        show: false,
                        hide: false,
                        id: null,
                    }))
                    setState((prev) => ({
                        ...prev,
                        handling: {
                            ...prev.handling,
                            hide: false
                        }
                    }));
                    alert(res.status, res.message || "Project has been updated successfully");
                })
            }
            else {
                alert(res.status || 500, res.message || "Something is wrong, try again");
                setState((prev) => ({
                    ...prev,
                    handling: {
                        ...prev.handling,
                        hide: false
                    }
                }));
            }
        }
        catch (err) {
            alert(err.status || 500, err.message || "Something is wrong, try again");
            setState((prev) => ({
                ...prev,
                handling: {
                    ...prev.handling,
                    hide: false
                }
            }));
        }
    }

    const handleMarked = (data) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'marked',
                execute: () => executeMarked(data)
            }
        ])
    }

    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0) return;

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
        processQueue();
    }, [apiQueue])

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

    const refetchData = () => {
        setState((prev) => ({ ...prev, error: null, pending: true }));
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }
    const handleRedirect = () => {
        redirect(true)
        navigateToProject();
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
        <div id="myProject">
            {/* Page Header */}
            <section className="project-header">
                <div className="header-text">
                    <span className="header-label">
                        <HiSparkles />
                        Workspace
                    </span>
                    <h1>My Projects</h1>
                    <p>Manage and track your development projects</p>
                </div>
                <button className="btn-new-project" onClick={handleRedirect}>
                    <FaPlus />
                    <span>New Project</span>
                </button>
            </section>

            {/* Search & Filter */}
            <section className="project-search">
                <SearchBar
                    placeholderText="Search projects..."
                    data={filterMapping}
                    submit={handleSubmitSearch}
                    setSearch={(value) => setState((prev) => ({ ...prev, search: value }))}
                    setFilter={(value) => setState((prev) => ({ ...prev, filter: value }))}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                />
            </section>

            {/* Project Grid */}
            <section className="project-grid">
                {state.pending ? (
                    <LoadingContent />
                ) : state.error ? (
                    <ErrorReload data={state.error || { status: 500, message: "Something is wrong" }} refetch={refetchData} />
                ) : state.data && state.data.length > 0 ? (
                    state.data.map((item) => (
                        <ProjectItem
                            key={item.id}
                            item={item}
                            isHandling={!!handlingMap[item.id]}
                            onDelete={handleDelete}
                        />
                    ))
                ) : (
                    <div className="empty-state">
                        <FaFolderOpen />
                        <h4>No projects found</h4>
                        <p>Create your first project to get started</p>
                        <button onClick={handleRedirect}>
                            <FaPlus />
                            Create Project
                        </button>
                    </div>
                )}
            </section>

            {/* Load More */}
            {!state.pending && state.data.length > 0 && load.hasMore && (
                <div className="load-more" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={state.error && "Something is wrong, try again..."}
                    />
                </div>
            )}
        </div>
    )
}