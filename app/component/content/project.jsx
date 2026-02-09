import { useState, useEffect, startTransition } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";
import UpdateHideStatusProjectService from "@/app/services/updateService/hideStatusProjectService";

import { useRouterActions } from "@/app/router/router";

import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import AlertPush from "../ui/alert";
import Search from "../ui/search";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { uniqWith } from "lodash";

import { MdAddCircleOutline } from "react-icons/md";
import { FaInfoCircle, FaRegTrashAlt } from "react-icons/fa";
import { FaUserGroup, FaUser, FaArrowRight } from "react-icons/fa6";
import { LuSearchX } from "react-icons/lu";

export function ProjectItem({
    item,
    statusColors,
    isHandling,
    onDelete
}) {
    const [confirmDelete, setConfirmDelete] = useState(false);

    return (
        <div className="item_project">
            <div className="project_actions">
                <button
                    className="delete_project"
                    onClick={() => {
                        setConfirmDelete(true);
                    }}
                >
                    <FaRegTrashAlt />
                </button>
            </div>
            <div className="main_item">
                <div className="main_top">
                    <button className="method_project">
                        {item.method === "Self" && <FaUser fontSize={16} />}
                        {item.method === "Team" && <FaUserGroup fontSize={16} />}
                    </button>
                    <h3>{item.name}</h3>
                </div>

                <div className="content_project">
                    <p className="description">
                        <FaInfoCircle
                            color="var(--color_blue)"
                            fontSize={16}
                            style={{ flexShrink: 0 }}
                        />
                        {item.description}
                    </p>
                </div>
            </div>

            <p
                className="status_project"
                style={{
                    "--color":
                        statusColors[item.status] ||
                        "var(--color_orange)",
                }}
            >
                {item.status}
            </p>

            <button className="join_project">
                <FaArrowRight fontSize={18} />
            </button>

            {confirmDelete && (
                <div className="confirm_handler">
                    {isHandling ? (
                        <LoadingContent scale={0.8} />
                    ) : (
                        <div className="form_confirm">
                            <div className="confirm_text">
                                <h4 className="delete_func">Deleting</h4>
                                <p>
                                    Are you sure you want to delete the
                                    project <strong>{item.name}</strong> ?
                                </p>
                            </div>

                            <div className="form_confirm_button">
                                <button
                                    className="delete_button"
                                    onClick={() => onDelete({ id: item.id, project: item.name })}
                                    disabled={isHandling}
                                >
                                    Delete
                                </button>
                                <button
                                    className="cancel_button"
                                    onClick={() =>
                                        setConfirmDelete(false)
                                    }
                                    disabled={isHandling}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function Project({ redirect }) {
    const { navigateToProject } = useRouterActions();

    const status_colors = {
        'Completed': 'var(--color_green)',
        'Ongoing': 'var(--color_blue)',
        'Not Started': 'var(--color_red)',
        'Pending': 'var(--color_orange)',
    };

    const filterMapping = [
        {
            name: 'status',
            items: [
                {
                    name: 'Pending',
                    value: 'Pending'
                },
                {
                    name: 'Ongoing',
                    value: 'Ongoing'
                },
                {
                    name: 'Completed',
                    value: 'Completed'
                },
                {
                    name: 'Not Started',
                    value: 'Not Started'
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
    const [alert, setAlert] = useState(null);

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
                    setAlert({
                        status: res.status,
                        message: "Deleted project successfully: " + project,
                    })
                })
            }
            else {
                setAlert({
                    status: res.status,
                    message: "Failed to delete project: " + project,
                });
            }
        }
        catch (err) {
            setAlert({
                status: err.status || 500,
                message: "Error deleting project: " + project,
            });
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
                    setAlert({
                        status: res.status,
                        message: res.message || "Successfully",
                    })
                })
            }
            else {
                setAlert({
                    status: res.status || 500,
                    message: res.message || "Something is wrong, try again",
                });
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
            setAlert({
                status: err.status || 500,
                message: "Something is wrong, try again",
            });
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
        <div id="myProject">
            <div className="heading-myProject">
                <Search
                    data={filterMapping}
                    submit={handleSubmitSearch}
                    setSearch={(value) => setState((prev) => ({ ...prev, search: value }))}
                    setFilter={(value) => setState((prev) => ({ ...prev, filter: value }))}
                    defaultFilter={defaultFilter}
                    pending={state.pending}
                />
                <div className="handle-project">
                    <button id="project-btn" onClick={handleRedirect}>
                        <MdAddCircleOutline fontSize={16} />
                        <span>
                            Add project
                        </span>
                    </button>
                </div>
            </div>
            <div className="project-list">
                {
                    state.pending ?
                        <LoadingContent />
                        :
                        state.error ?
                            <ErrorReload data={state.error || { status: 500, message: "Something is wrong" }} refetch={refetchData} />
                            :
                            state.data && state.data.length > 0 ?
                                state.data.map((item) => (
                                    <ProjectItem
                                        key={item.id}
                                        item={item}
                                        statusColors={status_colors}
                                        isHandling={!!handlingMap[item.id]}
                                        onDelete={handleDelete}
                                    />
                                ))
                                :
                                <p className='no_data'>
                                    <LuSearchX />
                                    No project can be found here !
                                </p>
                }
            </div>
            {!state.pending && state.data.length > 0 && load.hasMore && (
                <span className="load_wrapper" ref={setRef}>
                    <LoadingContent
                        scale={0.5}
                        message={state.error && "Something is wrong, try again..."}
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