import { useState, useEffect, startTransition, useMemo } from "react"

import MyProjectService from "@/app/services/getService/myProjectService";
import DeleteMyProjectService from "@/app/services/deleteService/myProjectService";
import { useRouterActions } from "@/app/router/router";

import Form from "next/form";
import { ErrorReload } from "../ui/error";
import { LoadingContent } from "../ui/loading";
import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";
import { uniqWith, debounce } from "lodash";

import { IoFilter, IoEyeOff } from "react-icons/io5";
import { MdAddCircleOutline } from "react-icons/md";
import { IoCloseSharp } from "react-icons/io5";

export default function Project({ redirect }) {
    const { navigateToProject } = useRouterActions();

    const [state, setState] = useState({
        data: [],
        pending: true,
        handleId: null,
        handling: false,
        message: null,
        error: null,
        search: ''
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 5,
        deletedCount: 0
    })

    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

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
            const res = await MyProjectService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString() });
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

    const executeDelete = async (id) => {
        if (!id) return;

        setState((prev) => ({ ...prev, handleId: id, handling: true }));

        try {
            const res = await DeleteMyProjectService(id);
            if (res.status === 200) {
                setLoad((prev) => ({ ...prev, deletedCount: prev.deletedCount + 1 }));
                setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== id) }));
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
                startTransition(() => {
                    setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
                })
            }
            else {
                setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: false, handleId: null }));
        }
    }

    const handleDelete = (id) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: "delete",
                execute: () => executeDelete(id)
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
        else if (task.type === "delete") {
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
        startTransition(() => {
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
        })
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
        redirect()
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

    return (
        <div id="myProject">
            <div className="heading-myProject" onSubmit={handleSubmit}>
                <Form className="input-search">
                    <input type="text" name="search" placeholder="Search my project" onChange={handleChange} autoComplete="off" autoFocus />
                    <button type="button" className="filter">
                        <IoFilter />
                    </button>
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
                                state.data.map((item, index) => (
                                    <div className="item-project" key={index}>
                                        <div className="heading-item">
                                            <div className="item">
                                                <span>{item.method}</span>
                                                <h3>{item.name}</h3>
                                            </div>
                                            <div className="status">
                                                <span>Status</span>
                                                <p>{item.status}</p>
                                            </div>
                                        </div>
                                        <div className="description">
                                            <h4>Description</h4>
                                            <p>{item.description}</p>
                                        </div>
                                        <div className="handle-project">
                                            <div className="table-handle">
                                                <button className="delete-btn" onClick={() => handleDelete(item.id)} disabled={state.handling}>
                                                    {
                                                        state.handleId === item.id && state.handling ?
                                                            <LoadingContent scale={0.4} color="var(--color_white)" />
                                                            :
                                                            <>
                                                                <span>Delete</span>
                                                                <IoCloseSharp />
                                                            </>
                                                    }
                                                </button>
                                                <button className="hidden-btn">
                                                    <span>Hidden</span>
                                                    <IoEyeOff />
                                                </button>
                                            </div>
                                            <button className="join-project">join</button>
                                        </div>
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
        </div>
    )
}