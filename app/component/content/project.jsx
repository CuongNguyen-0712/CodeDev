import { useState, useEffect, startTransition, useMemo, useRef } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";
import UpdateHideStatusProjectService from "@/app/services/updateService/hideStatusProjectService";

import Form from "next/form";
import { useRouterActions } from "@/app/router/router";
import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";
import AlertPush from "../ui/alert";

import { uniqWith, debounce } from "lodash";

import { IoFilter, IoEyeOff, IoEye } from "react-icons/io5";
import { MdAddCircleOutline, MdMoreHoriz } from "react-icons/md";
import { FaRegCheckCircle, FaInfoCircle } from "react-icons/fa";
import { FaDeleteLeft } from "react-icons/fa6";

export default function Project({ redirect }) {
    const { navigateToProject } = useRouterActions();
    const ref = useRef(null)
    const refDropdowns = useRef({})

    const [state, setState] = useState({
        data: [],
        pending: true,
        isHide: false,
        handling: false,
        message: null,
        error: null,
        search: '',
        filter: false,
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 10,
        deletedCount: 0
    })

    const [filter, setFilter] = useState({
        hide: false
    })

    const [dropdown, setDropdown] = useState({
        id: null,
        isShown: false,
    })

    const [confirm, setConfirm] = useState({
        hide: false,
        show: false,
        delete: false,
    })

    const refConfirm = useRef(confirm)

    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [alert, setAlert] = useState(null);

    const { setRef } = useInfiniteScroll({
        hasMore: load.hasMore,
        onLoadMore: () => {
            if (!isProcessing && load.hasMore) {
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
            const res = await MyProjectService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString(), filter: filter });
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
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }));
        }
    }

    const executeDelete = async (data) => {
        if (!data) return

        setState((prev) => ({ ...prev, handling: { ...prev.handling, delete: true } }));

        try {
            const res = await DeleteMyProjectService(data);
            if (res.status === 200) {
                setLoad((prev) => ({ ...prev, deletedCount: prev.deletedCount + 1 }));
                setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== data) }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                startTransition(() => {
                    setAlert({
                        status: res.status,
                        message: res.message || "Deleted successfully",
                        reset: () => setAlert(null)
                    })
                    setConfirm((prev) => ({ ...prev, delete: false }))
                    setState((prev) => ({ ...prev, handling: { ...prev.handling, delete: false } }));
                })
            }
            else {
                setAlert({
                    status: res.status,
                    message: res.message || "Delete failed",
                    reset: () => setAlert(null)
                });
                setState((prev) => ({ ...prev, handling: { ...prev.handling, delete: false } }));
                setConfirm((prev) => ({ ...prev, delete: false }))
            }
        }
        catch (err) {
            setAlert({
                status: err.status || 500,
                message: err.message || "Something is wrong, try again",
                reset: () => setAlert(null)
            });
            setState((prev) => ({ ...prev, handling: { ...prev.handling, delete: false } }));
            setConfirm((prev) => ({ ...prev, delete: false }))
        }
    }

    const handleDelete = (data) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: "delete",
                execute: () => executeDelete(data)
            }
        ])
    }

    const executeHide = async (data) => {
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
                        hide: false
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
                        reset: () => setAlert(null)
                    })
                })
            }
            else {
                setAlert({
                    status: res.status || 500,
                    message: res.message || "Something is wrong, try again",
                    reset: () => setAlert(null)
                });
                setState((prev) => ({
                    ...prev,
                    handling: {
                        ...prev.handling,
                        hide: false
                    }
                }));
                setConfirm((prev) => ({
                    ...prev,
                    show: false,
                    hide: false
                }))
            }
        }
        catch (err) {
            setAlert({
                status: err.status || 500,
                message: err.message || "Something is wrong, try again",
                reset: () => setAlert(null)
            });
            setState((prev) => ({
                ...prev,
                handling: {
                    ...prev.handling,
                    hide: false
                }
            }));
            setConfirm((prev) => ({
                ...prev,
                show: false,
                hide: false
            }))
        }
    }

    const handleHide = (data) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'hide',
                execute: () => executeHide(data)
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

    useEffect(() => {
        setState((prev) => ({ ...prev, isHide: filter.hide }));
    }, [state.pending])

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

    const refetchData = () => {
        setState((prev) => ({ ...prev, error: null, pending: true }));
        fetchData();
    }
    const handleRedirect = () => {
        redirect(true)
        navigateToProject();
    }

    const handleDebounce = useMemo(() => {
        return debounce((value) => {
            setState((prev) => ({ ...prev, search: value }));
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

    const handleRefDropdown = (e) => {
        if (!refDropdowns.current) return;

        const isClickInsideAnyDropdown = Object.values(refDropdowns.current).some(ref => {
            return ref && ref.contains(e.target);
        });

        if (!isClickInsideAnyDropdown && !(refConfirm.current.hide || refConfirm.current.delete || refConfirm.current.show)) {
            setDropdown((prev) => ({
                ...prev,
                id: null,
                isShown: false
            }));
        }
    };

    useEffect(() => {
        document.addEventListener('click', handleRefDropdown)
        return () => {
            document.removeEventListener('click', handleRefDropdown)
        }
    }, [dropdown.id])

    useEffect(() => {
        refConfirm.current = confirm
    }, [confirm])

    useEffect(() => {
        setAlert(null)
    }, [alert])

    return (
        <div id="myProject">
            <div className="heading-myProject">
                <Form className="input-search" onSubmit={handleSubmit}>
                    <input type="text" name="search" placeholder="Search your project" autoComplete="off" onChange={handleChange} />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {state.filter &&
                        <div className="table" ref={ref}>
                            <div className="content_table">
                                <div className="filter_value">
                                    <span>Status</span>
                                    <button
                                        type="button"
                                        onClick={() => setFilter({ ...filter, hide: !filter.hide })}
                                        style={filter.hide ? { background: 'var(--color_black)', color: 'var(--color_white)' } : { background: 'var(--color_gray_light)', color: 'var(--color_black)' }}
                                        disabled={state.pending}
                                    >
                                        Hide
                                    </button>
                                </div>
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
                                    <div className="item_project" key={item.id}>
                                        <div className="top_status">
                                            <button className="method_project">{item.method}</button>
                                            <button className="status_project">{item.status}</button>
                                            <div
                                                className='project_handler'
                                                ref={(el) => {
                                                    if (el) refDropdowns.current[item.id] = el
                                                    else delete refDropdowns.current[item.id];
                                                }}
                                            >
                                                <button
                                                    onClick={() => {
                                                        setDropdown((prev) => ({
                                                            ...prev,
                                                            id: item.id,
                                                            isShown: prev.id === item.id ? !prev.isShown : true
                                                        }))
                                                        setConfirm((prev) => ({
                                                            ...prev,
                                                            hide: false,
                                                            delete: false,
                                                            show: false
                                                        }))
                                                    }}
                                                    style={(dropdown.id === item.id && dropdown.isShown) ? { background: 'var(--color_black)', color: 'var(--color_white)' } : { background: 'var(--color_gray_light)', color: 'var(--color_black)' }}
                                                    disabled={state.handling.hide || state.handling.delete}
                                                >
                                                    <MdMoreHoriz fontSize={22} />
                                                </button>
                                                {
                                                    (dropdown.id === item.id && dropdown.isShown) &&
                                                    <div className="table_handler">
                                                        {
                                                            state.isHide ?
                                                                <button
                                                                    className='show_handler'
                                                                    onClick={() => setConfirm((prev) => ({
                                                                        ...prev,
                                                                        show: true
                                                                    }))}
                                                                >
                                                                    <IoEye />
                                                                    Show
                                                                </button>
                                                                :
                                                                <button
                                                                    className='hide_handler'
                                                                    onClick={() => {
                                                                        setConfirm((prev) => ({
                                                                            ...prev,
                                                                            hide: true
                                                                        }))
                                                                    }}
                                                                >
                                                                    <IoEyeOff />
                                                                    Hide
                                                                </button>
                                                        }
                                                        <button
                                                            className='delete_handler'
                                                            onClick={() => {
                                                                setConfirm((prev) => ({
                                                                    ...prev,
                                                                    delete: true
                                                                }))
                                                            }}
                                                        >
                                                            <FaDeleteLeft />
                                                            Delete
                                                        </button>
                                                    </div>
                                                }
                                            </div>
                                        </div>
                                        <div className='content_project'>
                                            <h3>{item.name}</h3>
                                            <div className="description">
                                                <FaInfoCircle
                                                    color={'var(--color_blue)'}
                                                    fontSize={18}
                                                />
                                                <p>{item.description}</p>
                                            </div>
                                        </div>
                                        <button className="join_project">Join</button>
                                        {
                                            (confirm.delete || confirm.hide || confirm.show) && dropdown.id === item.id &&
                                            <div className="confirm_handler">
                                                {
                                                    (state.handling.hide || state.handling.delete) ?
                                                        <LoadingContent scale={0.8} />
                                                        :
                                                        <div className='form_confirm'>
                                                            {
                                                                confirm.delete &&
                                                                <div className='confirm_text'>
                                                                    <h4 className="delete_func">Deleting</h4>
                                                                    <p>
                                                                        All data may be lost. Are you sure you want to delete this project?
                                                                    </p>
                                                                </div>
                                                            }
                                                            {
                                                                confirm.hide &&
                                                                <div className='confirm_text'>
                                                                    <h4 className="hide_func">Hiding</h4>
                                                                    <p>
                                                                        This action will hide the project. You can show it later.
                                                                    </p>
                                                                </div>
                                                            }
                                                            {
                                                                confirm.show &&
                                                                <div className='confirm_text'>
                                                                    <h4 className="hide_func">Showing</h4>
                                                                    <p>
                                                                        This action will show the project. You can hide it later.
                                                                    </p>
                                                                </div>
                                                            }
                                                            <div className='form_confirm_button'>
                                                                <button
                                                                    className="cancel_button"
                                                                    onClick={() => setConfirm({ delete: false, hide: false })}
                                                                >
                                                                    Cancel
                                                                </button>
                                                                {
                                                                    confirm.delete &&
                                                                    <button
                                                                        className="delete_button"
                                                                        onClick={() => handleDelete(item.id)}
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                }
                                                                {
                                                                    state.isHide ?
                                                                        <>
                                                                            {
                                                                                confirm.show &&
                                                                                <button
                                                                                    className="show_button"
                                                                                    onClick={() => handleHide({ id: item.id, hide: false })}
                                                                                >
                                                                                    Show
                                                                                </button>
                                                                            }
                                                                        </>
                                                                        :
                                                                        <>
                                                                            {
                                                                                confirm.hide &&
                                                                                <button
                                                                                    className="hide_button"
                                                                                    onClick={() => handleHide({ id: item.id, hide: true })}
                                                                                >
                                                                                    Hide
                                                                                </button>
                                                                            }
                                                                        </>
                                                                }
                                                            </div>
                                                        </div>
                                                }
                                            </div>
                                        }
                                    </div>
                                ))
                                :
                                <p>No project can be found here!</p>
                }
            </div>
            {!state.pending && !state.error && (
                load.hasMore ?
                    <span ref={setRef} className="load_wrapper">
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