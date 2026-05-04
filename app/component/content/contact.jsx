import { useState, useEffect, useMemo } from "react";
import Form from "next/form";
import Image from "next/image";

import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'

import { LoadingContent } from '../ui/loading'
import { ErrorReload } from '../ui/error'
import SearchBar from "../ui/searchBar";

import { uniqWith } from "lodash";
import { api } from "@/app/lib/axios";

import { IoPersonAdd } from "react-icons/io5";
import { FaUser, FaUserGroup, FaHashtag, FaArrowDownShortWide } from "react-icons/fa6";

export default function Contact({ redirect, state, setState }) {

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
            const response = await api.get('get/getUsersSocial', {
                params: {
                    search: social.search.trim(),
                    offset: currentOffset.toString(),
                    limit: social.limit,
                }
            })

            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];
                setSocial(prev => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [role]: uniqWith([...prev.data[role] ?? [], ...data], (a, b) => a.id === b.id),
                    },
                    hasMore: data.length >= prev.limit,
                    offset: currentOffset + prev.limit,
                    pending: false
                }))
            }
            else {
                setSocial(prev => ({ ...prev, error: { status: response.status, message: response.data.message }, pending: false }))
            }
        } catch (err) {
            setSocial(prev => ({ ...prev, error: { status: 500, message: 'Something is wrong, please try again' }, pending: false }))
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
                data: {
                    user: [],
                    team: []
                },
                offset: 0,
                hasMore: true,
                pending: true
            }))
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return;
        }

        setSocial((prev) => ({
            ...prev,
            data: {
                user: [],
                team: []
            },
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
            pending: true,
            data: {
                user: [],
                team: []
            }
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

    const refetchData = () => {
        setSocial((prev) => ({
            ...prev,
            error: null,
            data: {
                user: [],
                team: []
            },
            pending: true,
            offset: 0,
            hasMore: true
        }));
        fetchData();
    }


    return (
        <div className={`main_social ${state ? 'is_open' : 'is_close'}`}>
            <div className='social_header'>
                <div className='heading_view'>
                    <div className='title_group'>
                        <h3>Connect</h3>
                        <p>Find and connect with others</p>
                    </div>
                    <button
                        type='button'
                        className='close_btn'
                        onClick={() => setState(false)}
                        aria-label='Close social panel'
                    >
                        <FaArrowDownShortWide fontSize={18} />
                    </button>
                </div>

                <div className='social_controls'>
                    <div className='social_tabs'>
                        {roleSocial.map((item) => (
                            <button
                                key={item.name}
                                type='button'
                                className={`tab_item ${filter === item.name ? 'active' : ''}`}
                                onClick={() => setFilter(item.name)}
                            >
                                {item.icon}
                                <span>{item.name}s</span>
                                {filter === item.name && <span className='active_indicator' />}
                            </button>
                        ))}
                    </div>

                    <div className='search_wrapper'>
                        <SearchBar
                            placeholder={`Search ${filter.toLowerCase()}...`}
                            setSearch={(data) => setSocial((prev) => ({ ...prev, search: data }))}
                            submit={handleSubmit}
                            pending={social.pending}
                            isFilter={false}
                        />
                    </div>
                </div>
            </div>

            <div className='view_social'>
                {
                    state && (
                        social.pending && social.offset === 0 ?
                            <div className='loading_state'>
                                <LoadingContent scale={0.8} />
                            </div>
                            :
                            social.error ?
                                <ErrorReload data={social.error} refetch={refetchData} />
                                :
                                <div className='frame_social'>
                                    {social.data[filter.toLowerCase()]?.length > 0 ? (
                                        <>
                                            {social.data[filter.toLowerCase()].map((item) => (
                                                <div key={item.id} className='item_social_card'>
                                                    <div className='card_main'>
                                                        <div className='avatar_wrapper'>
                                                            <Image
                                                                src={item.image || (filter === 'Team' ? '/image/static/default.svg' : '/image/static/default_user.svg')}
                                                                alt={item.username || item.name}
                                                                width={56}
                                                                height={56}
                                                                quality={100}
                                                                className='social_avatar'
                                                            />
                                                            <div className={`status_indicator ${filter === 'User' ? 'online' : ''}`} />
                                                        </div>
                                                        <div className='social_info'>
                                                            <div className='name_row'>
                                                                <h4>{item.username || item.name}</h4>
                                                                <span className='type_badge'>{filter}</span>
                                                            </div>
                                                            <p className='nickname'>
                                                                <FaHashtag />
                                                                {item.nickname || (filter === 'Team' ? 'Team' : 'User')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className='card_actions'>
                                                        <button type='button' className='action_btn'>
                                                            <IoPersonAdd fontSize={16} />
                                                            <span>{filter === 'User' ? 'Invite' : 'Join'}</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                            {!social.pending && social.hasMore && (
                                                <span ref={setRef} className="load_wrapper">
                                                    <LoadingContent scale={0.5} />
                                                </span>
                                            )}
                                        </>
                                    ) : (
                                        <div className='empty_state'>
                                            <div className='empty_icon'>
                                                {filter === 'User' ? <FaUser /> : <FaUserGroup />}
                                            </div>
                                            <p>No {filter.toLowerCase()}s found</p>
                                            <span>Try adjusting your search or filter</span>
                                        </div>
                                    )}
                                </div>
                    )
                }
            </div>
        </div>
    )
}