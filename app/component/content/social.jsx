import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import Form from 'next/form'

import GetMySocialService from '@/app/services/getService/mySocialService'
import PostCreateTeamService from '@/app/services/postService/createTeamService'

import { useSize } from '@/app/contexts/sizeContext'
import { CreateTeamDefinition } from '@/app/lib/definition'

import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'
import useOutside from '@/app/hooks/useOutside'

import { ErrorReload } from '../ui/error'
import { LoadingContent } from '../ui/loading'

import { uniqWith, debounce } from 'lodash'

import Contact from './contact'

import { FaHashtag, FaRankingStar, FaRegUser, FaPlus, FaUser, FaUserGroup } from 'react-icons/fa6'
import { IoWarningOutline } from "react-icons/io5";
import { IoMdMore } from "react-icons/io";
import { MdDeleteForever, MdAdd, MdEdit } from "react-icons/md";
import { PiSignOutBold, PiListBold } from "react-icons/pi";

export default function Social({ redirect }) {
    const { size } = useSize();
    const refDropdowns = useRef({})

    const [state, setState] = useState({
        data: {
            friend: [],
            team: [],
        },
        pending: true,
        error: null,
        activeTab: 'friend',
        hasMore: true,
        hasSearch: false,
        limit: 5,
        offset: 0,
        search: '',
    })

    const [dropdown, setDropdown] = useState({
        id: null,
        isShown: false
    })

    const [shown, setShown] = useState(false);

    const [create, setCreate] = useState({
        isShown: false,
        pending: false,
        error: null,
        name: '',
        size: 0,
    })

    const { setRef } = useInfiniteScroll({
        hasMore: state.hasMore,
        onLoadMore: () => {
            if (!isProcessing && state.hasMore) {
                setApiQueue((prev) => [...prev, { type: "fetch" }]);
            }
        }
    })

    const refDropdown = useOutside({
        stateOutside: shown,
        setStateOutside: () => {
            setShown(false)
        }
    })

    const [apiQueue, setApiQueue] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);

    const fetchData = async () => {
        if (!state.hasMore) return;

        setState(prev => ({ ...prev, error: null, pending: true }))

        try {
            const res = await GetMySocialService({ tab: state.activeTab, search: state.search })
            if (res.status === 200) {
                setState(prev => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [state.activeTab]: uniqWith([...prev.data[state.activeTab], ...res.data], (a, b) => state.activeTab === 'friend' ? a.username === b.username : a.team_id === b.team_id)
                    },
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

    useEffect(() => {
        setState((prev) => ({
            ...prev,
            hasMore: true
        }))
        setApiQueue((prev) => [...prev, { type: 'fetch' }])
    }, [state.activeTab])


    const executeCreateTeam = async () => {
        setCreate(prev => ({ ...prev, pending: true }))
        try {
            const res = await PostCreateTeamService({ name: create.name, size: create.size })
            if (res.status === 200) {
                setCreate(prev => ({
                    ...prev,
                    name: '',
                    size: 0,
                    pending: false
                }))
                await fetchData();
            }
            else {
                setCreate(prev => ({
                    ...prev,
                    error: {
                        status: res.status,
                        message: res.message
                    },
                    pending: false
                }))
            }
        }
        catch (err) {
            setCreate(prev => ({
                ...prev,
                error: {
                    status: 500,
                    message: err.message
                },
                pending: false
            }))
        }
    }

    const processQueue = () => {
        if (isProcessing || apiQueue.length === 0) return;

        setIsProcessing(true);

        const task = apiQueue[0];

        if (task.type === "fetch") {
            fetchData()
        }
        else {
            task.execute()
        }

        setApiQueue((prev) => prev.slice(1));
        setIsProcessing(false);
    }

    useEffect(() => {
        processQueue();
    }, [apiQueue])

    const handleSubmitSearch = () => {
        if (state.search.length > 0 && state.search.trim() === '') return;

        if (state.hasSearch && state.search.trim() === '') {
            setState((prev) => ({
                ...prev,
                data: {
                    ...prev.data,
                    [prev.activeTab]: []
                },
                offset: 0,
                hasMore: true,
                pending: true
            }))
            setApiQueue((prev) => [...prev, { type: "fetch" }]);
            return;
        }

        setState((prev) => ({
            ...prev,
            data: {
                ...prev.data,
                [prev.activeTab]: []
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
    }, [state.search])

    const handleSubmit = (e) => {
        e.preventDefault();
        handleSubmitSearch();
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

    const refecthData = () => {
        setState((prev) => ({ ...prev, error: null, data: { ...state.data, [state.activeTab]: [] }, pending: true }));
        fetchData();
    }

    const handleCreate = (e) => {
        e.preventDefault();
        const check = CreateTeamDefinition({ name: create.name, size: create.size })
        if (check.success) {
            executeCreateTeam()
        }
        else {
            setCreate((prev) => ({ ...prev, error: check.errors }))
        }
    }

    const handleChangeCreate = (e) => {
        const { name, value } = e.target
        setCreate((prev) => ({
            ...prev,
            [name]: value,
            error: Object.fromEntries(
                Object.entries(prev.error || {}).filter(([key]) => key !== name)
            ),
        }))
    }

    const handleRefDropdown = (e) => {
        const isClickInsideAnyDropdown = Object.values(refDropdowns.current).some(ref => {
            return ref && ref.contains(e.target);
        });

        if (!isClickInsideAnyDropdown) {
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
    }, [])

    const views = {
        friend: (
            <>
                {
                    (state.data.friend?.length ?? 0) > 0 ?
                        state.data.friend.map((item, index) => (
                            <div className='card_social' key={index}>
                                {
                                    size.width >= 425 &&
                                    <Image src={item.image || '/image/default.svg'} alt='avatar' width={100} height={100} />
                                }
                                <div className='card_info'>
                                    <div className='top_info'>
                                        <div className='main_top'>
                                            <h3>{item.username}</h3>
                                            <span>
                                                <FaHashtag />
                                                {item.nickname}
                                            </span>
                                        </div>
                                        {
                                            size.width < 425 &&
                                            <Image src={'/image/default.svg'} alt='avatar' width={100} height={100} />
                                        }
                                    </div>
                                    <div className='tier'>
                                        <span>
                                            <FaRankingStar fontSize={20} />
                                        </span>
                                        <div className='tier_info'>
                                            <p>
                                                <strong>Level:</strong>
                                                {item.level}
                                            </p>
                                            <p>
                                                <strong>Rank:</strong>
                                                {item.rank}
                                            </p>
                                            <p>
                                                <strong>Star:</strong>
                                                {item.star}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className='card_btns'>
                                    <button>
                                        Info
                                    </button>
                                    <button>
                                        Contact
                                    </button>
                                </div>
                            </div>
                        ))
                        :
                        <p>No friend can be found here !</p>
                }
            </>
        ),
        team: (
            <>
                {
                    (state.data.team?.length ?? 0) > 0 ?
                        state.data.team.map((item, index) => (
                            <div className='card_team' key={index}>
                                <div className='header_team'>
                                    <Image src={item.team_image || '/image/default.svg'} alt='' width={80} height={80} />
                                    <div className='team_info'>
                                        <h3>{item.team_name}</h3>
                                        <div className='team_size'>
                                            <strong>Size:</strong>
                                            <p>{item.members.split(',').length}/{item.team_size}</p>
                                        </div>
                                        <div className='team_host'>
                                            <strong>Host:</strong>
                                            <p>{item.host_name}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className='team_members'>
                                    <strong>Members</strong>
                                    <p>
                                        {
                                            item.members.split(',').map((item, index) => (
                                                <span key={index} data-name={item}>
                                                    <FaRegUser />
                                                </span>
                                            ))
                                        }
                                    </p>
                                </div>
                                <div className="footer_team">
                                    <button>
                                        Join
                                    </button>
                                    <div className='team_btns'
                                        ref={(el) => {
                                            if (el) refDropdowns.current[index] = el
                                            else delete refDropdowns.current[index];
                                        }}>
                                        <button
                                            onClick={() => {
                                                setDropdown((prev) => ({
                                                    ...prev,
                                                    id: index,
                                                    isShown: prev.id === index ? !prev.isShown : true
                                                }))
                                            }}
                                            style={(dropdown.id === index && dropdown.isShown) ? { background: 'var(--color_black)', color: 'var(--color_white)' } : { background: 'var(--color_gray_light)', color: 'var(--color_black)' }}
                                        >
                                            <IoMdMore fontSize={20} />
                                        </button>
                                        {
                                            (dropdown.id === index && dropdown.isShown) &&
                                            <div className='team_dropdown'>
                                                {
                                                    item.is_host ?
                                                        <>
                                                            <button className='team_edit_btn'>
                                                                <MdEdit />
                                                                Edit
                                                            </button>
                                                            {
                                                                item.members.split(',').length < item.team_size &&
                                                                <button className='team_invite_btn'>
                                                                    <MdAdd />
                                                                    Invite
                                                                </button>
                                                            }
                                                            <span></span>
                                                            <button className="team_delete_btn">
                                                                <MdDeleteForever />
                                                                Delete
                                                            </button>
                                                        </>
                                                        :
                                                        <button className="team_leave_btn">
                                                            <PiSignOutBold />
                                                            Leave
                                                        </button>
                                                }
                                            </div>
                                        }
                                    </div>
                                </div>
                            </div>
                        ))
                        :
                        <p>No team can be found here !</p>
                }
                <Form
                    className={`form_create_team ${create.isShown ? 'shown' : ''}`}
                    onSubmit={handleCreate}
                >
                    {
                        create.isShown ?
                            <>
                                <div className='heading_create'>
                                    <Image src={`/image/static/logo.svg`} alt='logo' width={25} height={25} />
                                    <h3>Create team</h3>
                                </div>
                                <div className='content_create'>
                                    <div className='create_input'>
                                        <span>Name:</span>
                                        <input
                                            type="text"
                                            name='name'
                                            placeholder='Enter name'
                                            value={create.name}
                                            onChange={handleChangeCreate}
                                            disabled={create.pending}
                                            autoComplete='off'
                                        />
                                        {
                                            (create.error && create.error.name) &&
                                            <p className='error_create'>
                                                <IoWarningOutline fontSize={12} />
                                                {create.error.name}
                                            </p>
                                        }
                                    </div>
                                    <div className='create_input'>
                                        <span>Size:</span>
                                        <input
                                            type="text"
                                            name='size'
                                            placeholder='Enter size'
                                            inputMode='numeric'
                                            value={create.size}
                                            autoComplete='off'
                                            onChange={handleChangeCreate}
                                            disabled={create.pending}
                                            maxLength={2}
                                        />
                                        {
                                            (create.error && create.error.size) &&
                                            <p className='error_create'>
                                                <IoWarningOutline fontSize={12} />
                                                {create.error.size}
                                            </p>
                                        }
                                    </div>
                                </div>
                                <button type='submit' id='handle_create'>
                                    {
                                        create.pending ?
                                            <LoadingContent scale={0.4} color={'var(--color_white)'} />
                                            :
                                            <>
                                                Create
                                            </>
                                    }
                                </button>
                            </>
                            :
                            null
                    }
                    <button
                        type='button'
                        className='create_handler'
                        onClick={() => setCreate((prev) => ({ ...prev, isShown: !prev.isShown }))}
                    >
                        <FaPlus fontSize={create.isShown ? 14 : 18} />
                    </button>
                </Form>
            </>
        )
    };

    return (
        <div id='social'>
            <div className='my_social'>
                <div className='heading'>
                    {
                        size.width > 425 &&
                        <div className='social_btn'>
                            <button
                                onClick={() => setState(prev => ({ ...prev, activeTab: 'friend' }))}
                                className={`${state.activeTab === 'friend' ? 'active' : ''}`}
                                disabled={state.pending}
                            >
                                Friend
                            </button>
                            <button
                                onClick={() => setState(prev => ({ ...prev, activeTab: 'team' }))}
                                className={`${state.activeTab === 'team' ? 'active' : ''}`}
                                disabled={state.pending}
                            >
                                Team
                            </button>
                            <span
                                id='navigate_social'
                                style={
                                    state.activeTab === 'friend' ?
                                        { left: '0px' }
                                        :
                                        { left: 'calc(50% + 10px)' }
                                }
                            >
                            </span>
                        </div>
                    }
                    <Form className='social_search' onSubmit={handleSubmit}>
                        <input
                            type="text"
                            name='search'
                            placeholder='Search'
                            autoComplete='off'
                            onChange={handleChange}
                            autoFocus
                        />
                        {
                            size.width <= 425 &&
                            <div className={`social_mobile ${shown ? 'active' : ''}`} ref={refDropdown}>
                                <button
                                    type='button'
                                    onClick={() => setShown(!shown)}
                                >
                                    <PiListBold fontSize={16} />
                                </button>
                                <div className='social_mobile_btns'>
                                    <button
                                        type='button'
                                        className={state.activeTab === 'friend' ? 'active' : ''}
                                        onClick={() => setState(prev => ({ ...prev, activeTab: 'friend' }))}
                                    >
                                        <FaUser />
                                        Friend
                                    </button>
                                    <button
                                        type='button'
                                        className={state.activeTab === 'team' ? 'active' : ''}
                                        onClick={() => setState(prev => ({ ...prev, activeTab: 'team' }))}
                                    >
                                        <FaUserGroup />
                                        Team
                                    </button>
                                </div>
                            </div>
                        }
                    </Form>
                </div>
                <div className='content_social'>
                    {
                        state.pending ?
                            <LoadingContent />
                            :
                            <div
                                id='frame_social_content'
                                style={state.activeTab === 'friend' ? { gap: '50px' } : { gap: '20px' }}
                            >
                                {
                                    state.error ?
                                        <ErrorReload data={state.error} refetch={refecthData} />
                                        :
                                        <>
                                            {views[state.activeTab] || null}
                                        </>
                                }
                            </div>
                    }
                </div>
            </div>
            <Contact redirect={redirect} />
        </div >
    )
}