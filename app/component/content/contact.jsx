import { useState, useEffect, useMemo } from "react";
import Form from "next/form";
import Image from "next/image";

import GetSocialService from '@/app/services/getService/socialService'
import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'
import useOutside from "@/app/hooks/useOutside";

import { LoadingContent } from '../ui/loading'
import { ErrorReload } from '../ui/error'

import { uniqWith, debounce } from "lodash";

import { FaAngleDown } from "react-icons/fa";
import { IoPersonAdd } from "react-icons/io5";
import { FaUser, FaUserGroup, FaHashtag } from "react-icons/fa6";

export default function Contact() {

    const [social, setSocial] = useState({
        data: {
            user: [],
            team: []
        },
        hasMore: true,
        pending: true,
        isShown: false,
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

    const [filter, setFilter] = useState({
        icon: <FaUser />,
        value: 'User',
        dropdown: false
    });

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

    const refDropdown = useOutside({
        stateOutside: filter.dropdown,
        setStateOutside: () => {
            setFilter((prev) => ({
                ...prev,
                dropdown: false
            }))
        }
    })

    const fetchData = async () => {
        if (!social.hasMore) return;

        const role = filter.value.toLowerCase();

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
    }, [filter.value])

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
        <div className='main_social' style={social.isShown ? { height: 'calc(100% - 60px)', transition: '0.2s all ease', zIndex: 2 } : { height: '60px', transition: '0.2s all ease' }}>
            <div className='heading_view'>
                <Form className='input_social' onSubmit={handleSubmit}>
                    <input
                        type="text"
                        placeholder='Search'
                        autoComplete='off'
                        onFocus={() => {
                            if (!social.isShown) {
                                setSocial(prev => ({ ...prev, isShown: true }))
                            }
                        }
                        }
                        onChange={handleChange}
                    />
                </Form>
                <div id="filter_social" ref={refDropdown}>
                    <button
                        onClick={() => {
                            setFilter((prev) => ({
                                ...prev,
                                dropdown: !prev.dropdown
                            }))
                        }}
                    >
                        {filter.icon}
                        <FaAngleDown />
                    </button>
                    {
                        filter.dropdown &&
                        <div
                            className="dropdown"
                            style={social.isShown ? { top: '40px' } : { bottom: '40px' }}
                        >
                            {roleSocial.map((item, index) => (
                                <button
                                    key={index}
                                    disabled={filter.value === item.name}
                                    onClick={() => {
                                        setFilter((prev) => ({
                                            ...prev,
                                            dropdown: false,
                                            value: item.name,
                                            icon: item.icon,
                                        }))
                                    }}
                                >
                                    {item.icon}
                                    {item.name}
                                </button>
                            ))}
                        </div>
                    }
                </div>
            </div>
            {
                social.isShown &&
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
                                        {view[filter.value] || null}
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
                        <button onClick={() => setSocial(prev => ({ ...prev, isShown: false }))}>Close</button>
                    </div>
                </>
            }
        </div>
    )
}