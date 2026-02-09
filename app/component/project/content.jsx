import { useState, useEffect } from "react"

import GetProjectService from "@/app/services/getService/projectService";
import PostRegisterProjectService from "@/app/services/postService/registerProjectService";

import { useQuery } from "@/app/router/router";

import useInfiniteScroll from "@/app/hooks/useInfiniteScroll";

import { LoadingContent } from "../ui/loading";
import { ErrorReload } from "../ui/error";
import Search from "../ui/search";
import AlertPush from "../ui/alert";

import { filter, uniqWith } from "lodash";

import { FaArrowRight, FaChevronUp } from "react-icons/fa";
import { FaUser, FaUserGroup } from "react-icons/fa6";
import { MdPushPin, MdInfoOutline } from "react-icons/md";

const colorUI = {
    Open: {
        color: "var(--color_blue)",
        opacity: "rgba(30, 144, 255, 0.2)",
    },
    Closed: {
        color: "var(--color_red_light)",
        opacity: "rgba(255, 0, 0, 0.2)",
    },
    "Comming soon": {
        color: "var(--color_orange)",
        opacity: "rgba(255, 255, 0, 0.2)",
    },
};

export function ProjectItem({
    item,
    isHandling,
    onRegister,
}) {
    const [dropdown, setDropdown] = useState(false)

    const renderButtonText = () => {
        if (item.status === "Closed") return "Closed";
        if (item.status === "Comming soon") return "Comming soon...";
        return isHandling ? (
            <LoadingContent scale={0.5} color="var(--color_white)" />
        ) : (
            item.method === 'Self' ? "Join" : "Add"
        );
    };

    return (
        <div className="item">
            <div className="heading_item">
                <span
                    style={{
                        background: colorUI[item.status].opacity,
                        color: colorUI[item.status].color,
                    }}
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

                <div className={`info_dropdown ${dropdown ? "active" : ""}`}>
                    <button
                        type="button"
                        onClick={() => setDropdown(!dropdown)}
                    >
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
                    disabled={isHandling}
                    onClick={() => onRegister({ id: item.id, name: item.name })}
                >
                    {renderButtonText()}
                </button>
            </div>
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
                    data: {
                        ...prev,
                        data: prev.data.filter((item) => item.id !== id)
                    }
                }));
                setAlert({
                    status: res.status,
                    message: res.message
                })
                if (hasMore) {
                    setApiQueue((prev) => [...prev, { type: "fetch" }]);
                }
            }
            else {
                setAlert({
                    status: res.status,
                    message: res.message
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
        redirect()
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
        <div id="project">
            <div className="heading_project">
                <Search
                    data={filterMapping}
                    submit={handleSubmitSearch}
                    setSearch={(data) => setState(prev => ({ ...prev, search: data }))}
                    setFilter={(data) => setState(prev => ({ ...prev, filter: data }))}
                    pending={state.pending}
                    defaultFilter={defaultFilter}
                />
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
                {
                    state.pending ?
                        <LoadingContent />
                        :
                        state.error ?
                            <ErrorReload
                                data={state.error}
                                refetch={refetchData}
                            />
                            :
                            (state.data && state.data.length > 0) ?
                                state.data.map((item, index) => (
                                    <ProjectItem
                                        key={index}
                                        item={item}
                                        isHandling={!!handlingMap[item.id]}
                                        onRegister={handleRegister}
                                    />
                                ))
                                :
                                <p className="no_data">
                                    No project can be found !
                                </p>
                }
                {!state.pending && state.data.length > 0 && load.hasMore && (
                    <span className="load_wrapper" ref={setRef}>
                        <LoadingContent
                            scale={0.5}
                            message={state.error && "Something is wrong, check your connection"}
                        />
                    </span>
                )}
            </div>
            <AlertPush
                message={alert?.message}
                status={alert?.status}
            />
        </div >
    )
}