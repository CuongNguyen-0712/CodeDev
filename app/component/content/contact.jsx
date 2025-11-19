import { useState, useEffect, useMemo } from "react";
import Form from "next/form";
import Image from "next/image";

import GetSocialService from '@/app/services/getService/socialService'
import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'
import useOutside from "@/app/hooks/useOutside";

import { useSize } from "@/app/contexts/sizeContext";

import { LoadingContent } from '../ui/loading'
import { ErrorReload } from '../ui/error'

import { uniqWith, debounce } from "lodash";

import { IoPersonAdd } from "react-icons/io5";
import { FaUser, FaUserGroup, FaHashtag, FaArrowDownShortWide } from "react-icons/fa6";

export default function Contact({ redirect, state, setState }) {
    const { size } = useSize()

    const [social, setSocial] = useState({
        data: {
            user: [],
            team: []
        },
        hasMore: true,
        pending: true,
        error: null,
        search: '',
        offset: 0,
        limit: 20,
        hasSearch: false,
    })

    const roleSocial = [
        {
            icon: <FaUser />,
            name: 'User',
        },
        {
            icon: <FaUserGroup />,
            name: 'Team',
        }
    ]

    const [filter, setFilter] = useState('User');

    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const { setRef } = useInfiniteScroll({
        hasMore: social.hasMore,
        onLoadMore: () => {
            if (!isProcessing && social.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        }
    })
    const fetchData = async () => {
        if (!social.hasMore) return;

        const role = filter.toLowerCase();

        try {
            const currentOffset = social.offset;
            const res = await GetSocialService({
                search: social.search.trim(),
                offset: currentOffset.toString(),
                limit: social.limit,
                filter: role,
            })

            if (res.status === 200) {
                setSocial(prev => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [role]: uniqWith([...prev.data[role] ?? [], ...res.data], (a, b) => a.id === b.id),
                    },
                    hasMore: res.data.length >= prev.limit,
                    offset: currentOffset + prev.limit,
                    pending: false
                }))
            }
            else {
                setSocial(prev => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }))
            }
        } catch (err) {
            setSocial(prev => ({ ...prev, error: { status: 500, message: err.message }, pending: false }))
        }
    }

    useEffect(() => {
        fetchData();
    }, [])

    const processQueue = () => {
        if (isProcessing || apiQueue.length === 0) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        if (task.type === "fetch") {
            fetchData();
        }
        else {
            task.execute();
        }

        setApiQueue((prev) => prev.slice(1));
        setIsProcessing(false);
    }

    useEffect(() => {
        processQueue();
    }, [apiQueue])

    const handleSubmitSearch = () => {
        if (social.search.length > 0 && social.search.trim() === '') return;

        if (social.hasSearch && social.search.trim() === '') {
            setSocial((prev) => ({
                ...prev,
                data: [],
                offset: 0,
                hasMore: true,
                pending: true
            }))
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return;
        }

        setSocial((prev) => ({
            ...prev,
            data: [],
            offset: 0,
            hasMore: true,
            hasSearch: true,
            pending: true
        }))
        setApiQueue((prev) => [...prev, { type: "fetch" }]);
    }

    useEffect(() => {
        handleSubmitSearch();
    }, [social.search])

    useEffect(() => {
        setSocial((prev) => ({
            ...prev,
            offset: 0,
            hasMore: true,
            pending: true
        }))
        setApiQueue((prev) => [
            ...prev,
            {
                type: 'fetch'
            }
        ])
    }, [filter])

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubmitSearch();
    }

    const handleDebounce = useMemo(() => {
        return debounce((value) => {
            setSocial((prev) => ({ ...prev, search: value }));
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

    const refetchData = () => {
        setSocial((prev) => ({ ...prev, error: null, data: [], pending: true }));
        fetchData();
    }

    const view = {
        User: (
            <>
                {
                    (social.data.user?.length ?? 0) > 0 ?
                        social.data.user.map((item) => (
                            <div key={item.id} className='item_social'>
                                <div className='tag_heading'>
                                    <Image src={item.image} alt='my_avatar' width={60} height={60} />
                                    <div>
                                        <h4>
                                            {item.username}
                                        </h4>
                                        <p>
                                            <FaHashtag />
                                            {item.nickname}
                                        </p>
                                    </div>
                                </div>
                                <button>
                                    <IoPersonAdd fontSize={16} />
                                    Invite
                                </button>
                            </div>
                        ))
                        :
                        <p>No user can be found here !</p>
                }
            </>
        ),
        Team: (
            <>
                {
                    (social.data.team?.length ?? 0) > 0 ?
                        social.data.team.map((item) => (
                            <div key={item.id}>
                                {item.name}
                            </div>
                        ))
                        :
                        <p>No team can be found here !</p>
                }
            </>
        )
    }

    return (
        <div
            className='main_social'
            style={state ?
                {
                    top: '60px',
                    opacity: 1,
                    transition: '0.2s all ease'
                }
                :
                {
                    top: '100%',
                    opacity: 0,
                    transition: '0.2s all ease'
                }
            }
        >
            <div className='heading_view'>
                <Form className='input_social' onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder='Search'
                        autoComplete='off'
                        onChange={handleChange}
                    />
                </Form>
                <button onClick={() => setState(false)}>
                    <FaArrowDownShortWide fontSize={18} />
                </button>
            </div>
            {
                state &&
                <>
                    <div className='view_social'>
                        {
                            social.pending ?
                                <LoadingContent scale={0.8} />
                                :
                                social.error ?
                                    <ErrorReload data={social.error} refetch={refetchData} />
                                    :
                                    <div className='frame_social'>
                                        {view[filter] || null}
                                        {!social.pending && !social.error && (
                                            social.hasMore ?
                                                <span ref={setRef} className="load_wrapper">
                                                    <LoadingContent scale={0.5} />
                                                </span>
                                                :
                                                null
                                        )}
                                    </div>
                        }
                    </div>
                    <div className='footer_view_social'>
                        {
                            roleSocial.map((item, index) => (
                                <button
                                    key={index}
                                    className={`${filter === item.name ? 'active' : ''}`}
                                    onClick={() => setFilter(item.name)}
                                >
                                    {item.icon}
                                    {item.name}
                                </button>
                            ))
                        }
                    </div>
                </>
            }
        </ div>
    )
}