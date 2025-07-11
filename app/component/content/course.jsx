import { useState, useEffect, startTransition, useMemo } from "react"

import Image from "next/image";
import Form from "next/form";

import DeleteMyCourseServive from "@/app/services/deleteService/myCourseService";
import GetMyCourseService from "@/app/services/getService/myCourseService";

import { useRouterActions } from "@/app/router/router";
import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { debounce, uniqWith } from "lodash";

import { FaCartShopping } from "react-icons/fa6";
import { IoFilter, IoSettingsSharp, IoClose, IoEyeOff, IoTrashBin } from "react-icons/io5";

export default function MyCourse({ redirect }) {
    const { navigateToCourse } = useRouterActions();

    const [state, setState] = useState({
        data: [],
        search: '',
        filter: false,
        idHandle: null,
        pending: true,
        message: null,
        error: null,
        handling: {
            withdraw: false,
            hide: false
        }
    })

    const [load, setLoad] = useState({
        offset: 0,
        hasMore: true,
        hasSearch: false,
        limit: 5,
        deletedCount: 0
    })

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
        processQueue()
    }, [apiQueue])

    const handleNavigate = () => {
        redirect();
        navigateToCourse()
    }


    const fetchData = async () => {
        if (!load.hasMore) return;

        try {
            const adjustedOffset = Math.max(0, load.offset - load.deletedCount) || 0;
            console.log(adjustedOffset)
            const res = await GetMyCourseService({ search: state.search.trim(), limit: load.limit, offset: adjustedOffset.toString() });
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
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }))
        }
    }

    const handleWithdrawCourse = async (id) => {
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'delete',
                execute: async () => {

                    setState((prev) => ({ ...prev, handling: { ...prev.handling, withdraw: true } }))

                    try {
                        const res = await DeleteMyCourseServive(id);
                        if (res.status == 200) {
                            setLoad((prev) => ({ ...prev, deletedCount: prev.deletedCount + 1 }));
                            setState((prev) => ({ ...prev, data: prev.data.filter((item) => item.id !== id) }));
                            setApiQueue((prev) => [...prev, { type: "fetch" }]);
                            startTransition(() => {
                                setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: { ...prev.handling, withdraw: false }, idHandle: null }))
                            })
                        }
                        else {
                            setState((prev) => ({ ...prev, message: { status: res.status, message: res.message }, handling: { ...prev.handling, withdraw: false } }))
                        }
                    }
                    catch (err) {
                        setState((prev) => ({ ...prev, message: { status: 500, message: err.message }, handling: { ...prev.handling, withdraw: false } }))
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

    return (
        <div id="myCourse">
            <div className="heading-myCourse">
                <Form className="input-search" onSubmit={handleSubmit}>
                    <input type="text" name="search" placeholder="Search your course" autoComplete="off" onChange={handleChange} />
                    <button type="button" className={`filter ${state.filter ? 'active' : ''}`} onClick={() => setState((prev) => ({ ...prev, filter: !prev.filter }))}>
                        <IoFilter />
                    </button>
                    {state.filter &&
                        <div id="course_table">
                            <div className="content_table">

                            </div>
                            <div className="footer_table">
                                <button type="button" id="cancel_btn" onClick={() => setState((prev) => ({ ...prev, filter: false }))}>Cancel</button>
                                <button type="button" id="apply_btn">Apply</button>
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
                                state.data.map((item, index) => (
                                    <div key={index} className="course">
                                        <div className="heading-course">
                                            <Image src={item.image} width={50} height={50} alt="image-course" />
                                            <h3>{item.title}</h3>
                                        </div>
                                        <div className="content-course">
                                            <div className="item">
                                                <h4>Concept</h4>
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
                                            {
                                                state.idHandle === index ?
                                                    <div className="setting-list">
                                                        <button className="hide-course" disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>
                                                            <IoEyeOff />
                                                        </button>
                                                        <button className="cancel-course" onClick={() => handleWithdrawCourse(item.id)} disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>
                                                            {
                                                                state.handling.withdraw ?
                                                                    <LoadingContent scale={0.5} color={'var(--color_white)'} />
                                                                    :
                                                                    <>
                                                                        <IoTrashBin />
                                                                        Withdraw
                                                                    </>
                                                            }
                                                        </button>
                                                    </div>
                                                    :
                                                    <button className="join-course" disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'pointer' }}>Join</button>
                                            }
                                            <button className="setting-course" onClick={() => setState((prev) => ({ ...prev, idHandle: state.idHandle === index ? null : index }))} disabled={state.handling.withdraw} style={{ cursor: state.handling.withdraw ? 'not-allowed' : 'default' }}>
                                                {state.idHandle === index ? <IoClose /> : <IoSettingsSharp />}
                                            </button>
                                        </div>
                                    </div>
                                ))
                                :
                                <p>No course can be found here!</p>
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