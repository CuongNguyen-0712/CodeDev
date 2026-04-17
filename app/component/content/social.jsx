import { useState, useEffect, useMemo, useRef } from 'react'
import Image from 'next/image'
import Form from 'next/form'

import GetMySocialService from '@/app/services/getService/mySocialService'
import PostCreateTeamService from '@/app/services/postService/createTeamService'

import { CreateTeamDefinition } from '@/app/lib/definition'

import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'
import useOutside from '@/app/hooks/useOutside'

import { ErrorReload } from '../ui/error'
import { LoadingContent } from '../ui/loading'
import SearchBar from '../ui/searchBar'

import { uniqWith, debounce } from 'lodash'

import Contact from './contact'

import { FaHashtag, FaRankingStar, FaRegUser, FaPlus, FaUser, FaUserGroup } from 'react-icons/fa6'
import { IoWarningOutline, IoShareSocial, IoSearch } from "react-icons/io5";
import { IoMdMore } from "react-icons/io";
import { MdDeleteForever, MdAdd, MdEdit } from "react-icons/md";
import { PiSignOutBold } from "react-icons/pi";

export default function Social({ redirect }) {
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
        contact: false,
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

    const friendCount = state.data.friend?.length ?? 0
    const teamCount = state.data.team?.length ?? 0

    const renderNoData = (type) => {
        const isFriend = type === 'friend'

        return (
            <div className={`social_empty ${isFriend ? 'empty_friend' : 'empty_team'}`}>
                <div className='empty_visual'>
                    <span className='empty_orbit orbit_a'></span>
                    <span className='empty_orbit orbit_b'></span>
                    <div className='empty_icon'>
                        {isFriend ? <FaUser /> : <FaUserGroup />}
                    </div>
                </div>
                <div className='empty_text'>
                    <h4>{isFriend ? 'No Friends Found' : 'No Teams Found'}</h4>
                    <p>
                        {isFriend
                            ? 'Start building your network and keep your social circle active.'
                            : 'Create your first team to collaborate and track group progress in one place.'}
                    </p>
                </div>
                <div className='empty_actions'>
                    {
                        !isFriend &&
                        <button
                            type='button'
                            className='empty_btn empty_btn_main'
                            onClick={() => setCreate((prev) => ({ ...prev, isShown: true, error: null }))}
                        >
                            <FaPlus />
                            Create Team
                        </button>
                    }
                </div>
            </div>
        )
    }

    const views = {
        friend: (
            <div className='social_grid'>
                {
                    (state.data.friend?.length ?? 0) > 0 ?
                        state.data.friend.map((item, index) => (
                            <article className='social_card friend_card' key={item.username || item.nickname || index}>
                                <div className='card-header'>
                                    <div className='friend_identity'>
                                        <Image src={item.image || '/image/default.svg'} alt='avatar' width={64} height={64} />
                                        <div className='friend_text'>
                                            <h3>{item.username || 'Unknown user'}</h3>
                                            <p>
                                                <FaHashtag />
                                                <span>{item.nickname || 'No nickname'}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className='friend_status'>
                                        <span className='friend_badge'>Friend</span>
                                        <span className='friend_rank_tag'>Rank {item.rank || '-'}</span>
                                    </div>
                                </div>

                                <div className='card-body'>
                                    <div className='friend_metrics'>
                                        <div className='metric_item'>
                                            <small>Level</small>
                                            <strong>{item.level || '-'}</strong>
                                        </div>
                                        <div className='metric_item'>
                                            <small>Star</small>
                                            <strong>
                                                <FaRankingStar />
                                                {item.star ?? 0}
                                            </strong>
                                        </div>
                                    </div>
                                </div>

                                <div className='card-footer friend_footer'>
                                    <button type='button' className='btn-main'>Info</button>
                                    <button type='button' className='btn-sub'>Contact</button>
                                </div>
                            </article>
                        ))
                        :
                        renderNoData('friend')
                }
            </div>
        ),
        team: (
            <div className='social_grid'>
                <article className={`social_create ${create.isShown ? 'expanded' : ''}`}>
                    <div className='create_head'>
                        <h3>Create Team</h3>
                        <button
                            type='button'
                            className='create_toggle'
                            onClick={() => setCreate((prev) => ({ ...prev, isShown: !prev.isShown, error: null }))}
                        >
                            <FaPlus fontSize={14} />
                        </button>
                    </div>

                    {
                        create.isShown &&
                        <Form className='create_form' onSubmit={handleCreate}>
                            <label className='create_input'>
                                <span>Name</span>
                                <input
                                    type='text'
                                    name='name'
                                    placeholder='Enter team name'
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
                            </label>

                            <label className='create_input'>
                                <span>Size</span>
                                <input
                                    type='text'
                                    name='size'
                                    placeholder='Enter team size'
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
                                {
                                    (create.error && create.error.message) &&
                                    <p className='error_create'>
                                        <IoWarningOutline fontSize={12} />
                                        {create.error.message}
                                    </p>
                                }
                            </label>

                            <button type='submit' className='btn-main create_submit' disabled={create.pending}>
                                {
                                    create.pending
                                        ? <LoadingContent scale={0.4} color={'var(--color_white)'} />
                                        : <>Create Team</>
                                }
                            </button>
                        </Form>
                    }
                </article>

                {
                    (state.data.team?.length ?? 0) > 0
                        ? state.data.team.map((item, index) => {
                            const memberList = item.members ? item.members.split(',').map((name) => name.trim()).filter(Boolean) : []
                            const usedSlots = memberList.length
                            const teamSize = Number(item.team_size) || 0
                            const progress = teamSize > 0 ? Math.min(100, Math.round((usedSlots / teamSize) * 100)) : 0

                            return (
                                <article className='social_card team_card' key={item.team_id || item.team_name || index}>
                                    <div className='card-header'>
                                        <div className='team_identity'>
                                            <Image src={item.team_image || '/image/default.svg'} alt='team' width={64} height={64} />
                                            <div className='team_text'>
                                                <h3>{item.team_name || 'Untitled team'}</h3>
                                                <p><strong>Host:</strong> {item.host_name || '-'}</p>
                                            </div>
                                        </div>
                                        <span className='team_badge'>{usedSlots}/{teamSize || '-'}</span>
                                    </div>

                                    <div className='card-body'>
                                        <div className='team_progress'>
                                            <span style={{ width: `${progress}%` }}></span>
                                        </div>
                                        <div className='team_members'>
                                            <p>
                                                {
                                                    memberList.length > 0
                                                        ? memberList.map((member, memberIndex) => (
                                                            <span key={`${member}-${memberIndex}`} data-name={member}>
                                                                <FaRegUser />
                                                            </span>
                                                        ))
                                                        : <em>No members yet</em>
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    <div className='card-footer'>
                                        <button type='button' className='btn-main'>Join</button>
                                        <div
                                            className='team_btns'
                                            ref={(el) => {
                                                if (el) refDropdowns.current[index] = el
                                                else delete refDropdowns.current[index]
                                            }}
                                        >
                                            <button
                                                type='button'
                                                className='btn-sub icon_only'
                                                onClick={() => {
                                                    setDropdown((prev) => ({
                                                        ...prev,
                                                        id: index,
                                                        isShown: prev.id === index ? !prev.isShown : true
                                                    }))
                                                }}
                                            >
                                                <IoMdMore fontSize={18} />
                                            </button>
                                            {
                                                (dropdown.id === index && dropdown.isShown) &&
                                                <div className='team_dropdown'>
                                                    {
                                                        item.is_host
                                                            ? <>
                                                                <button className='team_edit_btn' type='button'>
                                                                    <MdEdit />
                                                                    Edit
                                                                </button>
                                                                {
                                                                    usedSlots < teamSize &&
                                                                    <button className='team_invite_btn' type='button'>
                                                                        <MdAdd />
                                                                        Invite
                                                                    </button>
                                                                }
                                                                <span></span>
                                                                <button className='team_delete_btn' type='button'>
                                                                    <MdDeleteForever />
                                                                    Delete
                                                                </button>
                                                            </>
                                                            : <button className='team_leave_btn' type='button'>
                                                                <PiSignOutBold />
                                                                Leave
                                                            </button>
                                                    }
                                                </div>
                                            }
                                        </div>
                                    </div>
                                </article>
                            )
                        })
                        : renderNoData('team')
                }
            </div>
        )
    }

    return (
        <>
            <section id='social' className='social-v2'>
                <div className='social-header'>
                    <div className='header-content'>
                        <div className='header-text'>
                            <span className='header-label'>
                                <IoShareSocial />
                                Social Hub
                            </span>
                            <h2>Social Workspace</h2>
                            <p>Manage friends, teams, and collaboration quickly.</p>
                        </div>
                        <div className='header-actions'>
                            <button
                                type='button'
                                className='social-cta'
                                onClick={() => setState((prev) => ({ ...prev, contact: !prev.contact }))}
                            >
                                <IoShareSocial fontSize={18} />
                                Open Social
                            </button>
                        </div>
                    </div>
                </div>

                <div className='social-toolbar'>
                    <SearchBar
                        placeholderText={state.activeTab === 'friend' ? 'Search friends...' : 'Search teams...'}
                        data={state.activeTab === 'friend' ? state.data.friend : state.data.team}
                        setSearch={(value) => setState((prev) => ({ ...prev, search: value }))}
                        submit={handleSubmit}
                        pending={state.pending}
                        isFilter={false}
                    />
                    <div className='social-tabs-shell' role='tablist' aria-label='Social view switcher'>
                        <button
                            type='button'
                            role='tab'
                            aria-selected={state.activeTab === 'friend'}
                            className={`tab-switch ${state.activeTab === 'friend' ? 'active' : ''}`}
                            onClick={() => setState((prev) => ({ ...prev, activeTab: 'friend' }))}
                        >
                            <span className='tab-icon'>
                                <FaUser />
                            </span>
                            <span className='tab-copy'>
                                <strong>Friends</strong>
                                <small>People in your network</small>
                            </span>
                            <span className='tab-pill'>{friendCount}</span>
                        </button>

                        <button
                            type='button'
                            role='tab'
                            aria-selected={state.activeTab === 'team'}
                            className={`tab-switch ${state.activeTab === 'team' ? 'active' : ''}`}
                            onClick={() => setState((prev) => ({ ...prev, activeTab: 'team' }))}
                        >
                            <span className='tab-icon'>
                                <FaUserGroup />
                            </span>
                            <span className='tab-copy'>
                                <strong>Teams</strong>
                                <small>Group and collaboration space</small>
                            </span>
                            <span className='tab-pill'>{teamCount}</span>
                        </button>
                    </div>
                </div>

                <div className='social-content'>
                    {
                        state.pending
                            ? <LoadingContent />
                            : state.error
                                ? <ErrorReload data={state.error} refetch={refecthData} />
                                : views[state.activeTab] || null
                    }
                </div>
            </section>
            <Contact redirect={redirect} state={state.contact} setState={(value) => setState(prev => ({ ...prev, contact: value }))} />
        </>
    )
}