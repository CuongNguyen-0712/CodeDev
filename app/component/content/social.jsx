import { useState, useEffect, useMemo, useRef } from 'react'

import Image from 'next/image'
import Form from 'next/form'

import { api } from '@/app/lib/axios'

import { validate } from '@/app/helper/validate'
import { CreateTeamSchema } from '@/app/lib/definition'

import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'
import useOutside from '@/app/hooks/useOutside'

import { ErrorReload } from '../ui/error'
import { LoadingContent } from '../ui/loading'
import SearchBar from '../ui/searchBar'
import { InputGroup, TextAreaGroup } from '../ui/input'

import { startCase, uniqWith } from 'lodash'

import Contact from './contact'

import { FaHashtag, FaChevronLeft, FaRankingStar, FaRegUser, FaPlus, FaUser, FaUserGroup } from 'react-icons/fa6'
import { IoShareSocial } from "react-icons/io5";
import { IoMdMore, IoMdResize } from "react-icons/io";
import { MdDeleteForever, MdAdd, MdEdit, MdGroupAdd } from "react-icons/md";
import { PiSignOutBold } from "react-icons/pi";

export default function Social({ redirect, alert }) {
    const refDropdowns = useRef({})

    const requestApi = {
        friend: 'get/getMyFriends',
        team: 'get/getMyTeams',
    }

    const [state, setState] = useState({
        data: {
            friend: [],
            team: [],
        },
        pending: true,
        error: {
            friend: null,
            team: null,
        },
        activeTab: 'friend',
        hasMore: {
            friend: true,
            team: true,
        },
        hasSearch: false,
        contact: false,
        limit: 20,
        offset: {
            friend: 0,
            team: 0,
        },
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
        definition: null,
        data: {
            name: '',
            size: '2',
            description: '',
        }
    })

    const { setRef } = useInfiniteScroll({
        hasMore: state.hasMore,
        onLoadMore: () => {
            if (!isProcessing && state.hasMore[state.activeTab]) {
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
        if (!state.hasMore[state.activeTab]) return;

        setState(prev => ({ ...prev, error: { ...prev.error, [state.activeTab]: null }, pending: true }))

        try {
            const response = await api.get(requestApi[state.activeTab], {
                params: {
                    search: state.search,
                    offset: state.offset[state.activeTab].toString(),
                    limit: state.limit,
                }
            })
            if (response.data.success) {
                const data = Array.isArray(response.data.data) ? response.data.data : [];
                setState(prev => ({
                    ...prev,
                    data: {
                        ...prev.data,
                        [state.activeTab]: uniqWith(
                            [...prev.data[state.activeTab], ...data],
                            (a, b) => a.team_id === b.team_id
                        )
                    },
                    offset: {
                        ...prev.offset,
                        [state.activeTab]: prev.offset[state.activeTab] + data.length
                    },
                    hasMore: {
                        ...prev.hasMore,
                        [state.activeTab]: data.length === prev.limit
                    },
                    pending: false
                }))
            }
            else {
                setState((prev) => ({ ...prev, error: { ...prev.error, [state.activeTab]: { status: response.status, message: response.data.message } }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { ...prev.error, [state.activeTab]: { status: err.response?.status || 500, message: err?.response?.data?.message || 'Something is wrong, please try again' } }, pending: false }))
        }
    }

    useEffect(() => {
        setState((prev) => ({
            ...prev,
            hasMore: {
                ...state.hasMore,
                [state.activeTab]: true
            }
        }))
        setApiQueue((prev) => [...prev, { type: 'fetch' }])
    }, [state.activeTab])

    const processQueue = async () => {
        if (isProcessing || apiQueue.length === 0) return;

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
                error: {
                    ...prev.error,
                    [prev.activeTab]: null
                },
                hasMore: {
                    ...prev.hasMore,
                    [prev.activeTab]: true
                },
                hasSearch: false,
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
            offset: {
                ...prev.offset,
                [prev.activeTab]: 0
            },
            hasMore: {
                ...prev.hasMore,
                [prev.activeTab]: true
            },
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

    const refetchData = () => {
        setState((prev) => ({
            ...prev,
            error: {
                ...prev.error,
                [state.activeTab]: null
            },
            data: {
                ...state.data,
                [state.activeTab]: []
            },
            pending: true
        }));
        fetchData();
    }

    const handleCreate = async (e) => {
        e.preventDefault();

        if (create.pending) return;

        setCreate(prev => ({ ...prev, pending: true }))

        try {
            const { success, errors } = validate(CreateTeamSchema, create.data);

            if (success) {
                const response = await api.post('post/postCreateTeam', create.data)

                if (response.data.success) {
                    setCreate(prev => ({
                        ...prev,
                        data: {
                            name: '',
                            size: '2',
                            description: '',
                        },
                        definition: null,
                        pending: false
                    }))
                    setState((prev) => ({
                        ...prev,
                        data: {
                            ...prev.data,
                            team: []
                        },
                        offset: {
                            ...prev.offset,
                            team: 0
                        },
                        hasMore: {
                            ...prev.hasMore,
                            team: true
                        },
                        pending: true
                    }))
                    setApiQueue((prev) => [...prev, { type: "fetch" }]);
                    alert(201, "Team created successfully")
                }
                else {
                    alert(response.status, response.data.message)
                }
            }
            else {
                setCreate(prev => ({ ...prev, pending: false, definition: errors }))
            }
        }
        catch (err) {
            alert(err.response?.status || 500, err?.response?.data?.message || 'Something is wrong, please try again')
        }
        finally {
            setCreate(prev => ({ ...prev, pending: false }))
        }
    }

    const handleChangeCreate = (e) => {
        const { name, value } = e.target

        const nextUpdate = {
            ...create.data,
            [name]: name === 'size' ? value.replace(/[^0-9]/g, "").slice(-1) : value
        };

        const { errors } = validate(
            CreateTeamSchema,
            nextUpdate
        );

        setCreate((prev) => {
            const { [name]: removed, ...rest } = prev.definition || {};

            return {
                ...prev,
                data: nextUpdate,
                definition: errors?.[name] ?
                    { ...prev.definition, [name]: errors[name] }
                    :
                    rest
            }
        })
    }

    const handleClearCreate = (name) => {
        setCreate((prev) => {
            const { [name]: removed, ...rest } = prev.definition || {};

            return {
                ...prev,
                data: {
                    ...prev.data,
                    [name]: ''
                },
                definition: rest
            }
        })
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
                            className='btn-primary'
                            style={{ width: 'max-content', padding: '0 24px' }}
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
                                <div className='card_glow'></div>
                                <div className='card-header'>
                                    <div className='friend_identity'>
                                        <div className='avatar_container'>
                                            <Image src={item.image || '/image/static/default.svg'} alt='avatar' width={64} height={64} className='friend_avatar' />
                                            <span className='online_status'></span>
                                        </div>
                                        <div className='friend_text'>
                                            <h3>{item.username || 'Unknown user'}</h3>
                                            <p className='friend_nickname'>
                                                <FaHashtag />
                                                <span>{item.nickname || 'No nickname'}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <div className='friend_badges'>
                                        <span className='badge badge_friend'>Friend</span>
                                        <div className='rank_pill'>
                                            <FaRankingStar />
                                            <span>Rank {item.rank || '-'}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className='card-body'>
                                    <div className='friend_metrics'>
                                        <div className='metric_box'>
                                            <div className='metric_icon'>LVL</div>
                                            <div className='metric_content'>
                                                <small>Level</small>
                                                <strong>{item.level || '-'}</strong>
                                            </div>
                                        </div>
                                        <div className='metric_box'>
                                            <div className='metric_icon star'><FaRankingStar /></div>
                                            <div className='metric_content'>
                                                <small>Stars</small>
                                                <strong>{item.star ?? 0}</strong>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className='card-footer friend_footer'>
                                    <button type='button' className='btn-glass'>View Profile</button>
                                    <button type='button' className='btn-primary'>Message</button>
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
                {
                    (state.data.team?.length ?? 0) > 0
                        ? state.data.team.map((item, index) => {
                            const memberList = item.members ? item.members.split(',').map((name) => name.trim()).filter(Boolean) : []
                            const usedSlots = memberList.length
                            const teamSize = Number(item.team_size) || 0
                            const progress = teamSize > 0 ? Math.min(100, Math.round((usedSlots / teamSize) * 100)) : 0

                            return (
                                <article className='social_card team_card' key={item.team_id}>
                                    <div className='card_glow'></div>
                                    <div className='card-header'>
                                        <div className='team_identity'>
                                            <div className='team_image_wrapper'>
                                                <Image src={item.team_image || '/image/default.svg'} alt='team' width={60} height={60} className='team_image' />
                                            </div>
                                            <div className='team_text'>
                                                <h3>{item.team_name || 'Untitled team'}</h3>
                                                <p>Hosted by <strong>{item.host_name || '-'}</strong></p>
                                            </div>
                                        </div>
                                        <div className='team_slot_pill'>
                                            <FaUserGroup />
                                            <span>{usedSlots}/{teamSize || '-'}</span>
                                        </div>
                                    </div>

                                    <div className='card-body'>
                                        <div className='progress_section'>
                                            <div className='progress_info'>
                                                <small>Team Fill</small>
                                                <span>{progress}%</span>
                                            </div>
                                            <div className='team_progress_bar'>
                                                <div className='progress_fill' style={{ width: `${progress}%` }}>
                                                    <div className='progress_shimmer'></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className='team_member_preview'>
                                            <div className='avatar_stack'>
                                                {
                                                    memberList.length > 0
                                                        ? memberList.slice(0, 5).map((member, memberIndex) => (
                                                            <div key={`${member}-${memberIndex}`} className='stack_item' data-name={member} title={member}>
                                                                <FaRegUser />
                                                            </div>
                                                        ))
                                                        : <em className='no_members'>Be the first to join</em>
                                                }
                                                {memberList.length > 5 && <div className='stack_more'>+{memberList.length - 5}</div>}
                                            </div>
                                        </div>
                                    </div>

                                    <div className='card-footer'>
                                        <button type='button' className='btn-primary btn-join-team'>
                                            {item.is_member ? 'Open Team' : 'Join Team'}
                                        </button>
                                        <div
                                            className='team_options'
                                            ref={(el) => {
                                                if (el) refDropdowns.current[index] = el
                                                else delete refDropdowns.current[index]
                                            }}
                                        >
                                            <button
                                                type='button'
                                                className='btn-icon-sub'
                                                onClick={() => {
                                                    setDropdown((prev) => ({
                                                        ...prev,
                                                        id: index,
                                                        isShown: prev.id === index ? !prev.isShown : true
                                                    }))
                                                }}
                                            >
                                                <IoMdMore />
                                            </button>
                                            {
                                                (dropdown.id === index && dropdown.isShown) &&
                                                <div className='team_dropdown_menu'>
                                                    {
                                                        item.is_host
                                                            ? <>
                                                                <button className='menu_item' type='button'>
                                                                    <MdEdit />
                                                                    <span>Edit Team</span>
                                                                </button>
                                                                {
                                                                    usedSlots < teamSize &&
                                                                    <button className='menu_item' type='button'>
                                                                        <MdAdd />
                                                                        <span>Invite Friends</span>
                                                                    </button>
                                                                }
                                                                <div className='menu_divider'></div>
                                                                <button className='menu_item danger' type='button'>
                                                                    <MdDeleteForever />
                                                                    <span>Delete Team</span>
                                                                </button>
                                                            </>
                                                            : <button className='menu_item danger' type='button'>
                                                                <PiSignOutBold />
                                                                <span>Leave Team</span>
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
            <section id='social'>
                <div className='header-content'>
                    <div className='header-text'>
                        <span className='header-label'>
                            <IoShareSocial />
                            Social
                        </span>
                        <h1>My Network</h1>
                        <p>Manage friends, teams, and collaboration quickly.</p>
                    </div>
                    <div className='header-actions'>
                        <button
                            type='button'
                            className='header-btn'
                            id='contact_dialog_btn'
                            onClick={() => setState((prev) => ({ ...prev, contact: !prev.contact }))}
                        >
                            <IoShareSocial fontSize={18} />
                            Open Social
                        </button>
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
                            </span>
                            <span className='tab-pill'>{teamCount}</span>
                        </button>
                    </div>
                </div>

                <div className='social-content'>
                    {
                        state.pending
                            ? <LoadingContent />
                            : state.error?.[state.activeTab]
                                ? <ErrorReload data={state.error[state.activeTab]} refetch={refetchData} />
                                :
                                views[state.activeTab]
                    }
                </div>
            </section>
            <Contact redirect={redirect} state={state.contact} setState={(value) => setState(prev => ({ ...prev, contact: value }))} />
            {
                state.activeTab === 'team' &&
                <button
                    type='button'
                    className={`floating_create_btn ${create.isShown ? 'active' : ''}`}
                    onClick={() => setCreate((prev) => ({ ...prev, isShown: !prev.isShown, error: null }))}
                    aria-label='Create team'
                >
                    <div className='btn_icon'>
                        <FaPlus />
                    </div>
                    <span className='btn_label'>Create Team</span>
                </button>
            }
            <Form className={`create_form ${create.isShown ? 'active' : ''}`} onSubmit={handleCreate}>
                <div className='create_form_header'>
                    <div className='header_icon'>
                        <MdGroupAdd />
                    </div>
                    <div className='header_text'>
                        <h2>Build Your Team</h2>
                        <p>Set up a new space for your squad to grow.</p>
                    </div>
                    <button
                        type='button'
                        className='create_close'
                        onClick={() => setCreate(prev => ({ ...prev, isShown: false, error: null }))}
                    >
                        <FaChevronLeft fontSize={16} />
                    </button>
                </div>

                <div className='create_form_body'>
                    <div className='input_section'>
                        <InputGroup
                            name='name'
                            label='Team name'
                            value={create.data?.name}
                            error={create.definition?.name}
                            icon={<FaUserGroup className='icon' />}
                            reset={handleClearCreate}
                            onChange={handleChangeCreate}
                        />
                        <InputGroup
                            name='size'
                            label='Team size'
                            type='text'
                            inputMode='numeric'
                            value={create.data?.size}
                            error={create.definition?.size}
                            icon={<IoMdResize className='icon' />}
                            reset={handleClearCreate}
                            onChange={handleChangeCreate}
                        />
                        <TextAreaGroup
                            name='description'
                            label='What is your team about?'
                            value={create.data?.description}
                            reset={handleClearCreate}
                            onChange={handleChangeCreate}
                        />
                    </div>
                </div>

                <div className='create_form_footer'>
                    <button
                        type='button'
                        className='btn_cancel'
                        onClick={() => setCreate(prev => ({ ...prev, definition: null, data: { name: '', size: '', description: '' } }))}
                    >
                        Discard
                    </button>
                    <button type='submit' className='btn_submit' disabled={create.pending}>
                        {
                            create.pending
                                ?
                                <LoadingContent scale={0.4} color={'var(--color_white)'} />
                                :
                                <>
                                    Confirm & Create
                                </>
                        }
                    </button>
                </div>
            </Form>
        </>
    )
}