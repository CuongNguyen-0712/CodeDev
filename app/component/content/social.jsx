import { useState, useEffect } from 'react'
import Image from 'next/image'
import Form from 'next/form'

import GetMySocialService from '@/app/services/getService/mySocialService'
import GetSocialService from '@/app/services/getService/socialService'
import { useSize } from '@/app/contexts/sizeContext'
import useInfiniteScroll from '@/app/hooks/useInfiniteScroll'

import { LoadingContent } from '../ui/loading'
import { ErrorReload } from '../ui/error'

import { FaHashtag, FaRankingStar, FaRegUser, FaInfo } from 'react-icons/fa6'
import { TbWorld } from "react-icons/tb";
import { IoClose, IoPersonAdd } from "react-icons/io5";

export default function Social() {
    const { size } = useSize();

    const [state, setState] = useState({
        data: {
            friend: [],
            team: [],
        },
        pending: true,
        error: null,
        activeTab: 'friend',
    })

    const [social, setSocial] = useState({
        data: [],
        hasMore: false,
        pending: true,
        isShown: false,
        error: null,
        search: '',
        offset: 0,
        limit: 5,
    })

    const fetchData = async () => {

        setState(prev => ({ ...prev, error: null, pending: true }))

        try {
            const res = await GetMySocialService(state.activeTab)
            if (res.status === 200) {
                setState(prev => ({ ...prev, data: { ...state.data, [state.activeTab]: res.data }, pending: false }))
            }
            else {
                setState((prev) => ({ ...prev, error: { status: res.status, message: res.message }, pending: false }))
            }
        }
        catch (err) {
            setState((prev) => ({ ...prev, error: { status: 500, message: err.message }, pending: false }))
        }
    }

    const fetchDataSocial = async () => {
        try {
            const res = await GetSocialService({
                search: social.search.trim(),
            })

            if (res.status === 200) {
                setSocial(prev => ({ ...prev, data: res.data, hasMore: res.data.length >= prev.limit, pending: false }))
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
    }, [state.activeTab])

    return (
        <div id='social'>
            <div className='my_social'>
                <div className='heading'>
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
                    </div>
                    <Form className='social_search' onSubmit={(e) => e.preventDefault()}>
                        <input type="text" name='search' placeholder='Search' autoComplete='off' autoFocus />
                    </Form>
                </div>
                <div className='content'>
                    {
                        state.pending ?
                            <LoadingContent />
                            :
                            <div id='frame_social'>
                                {state.error ?
                                    <ErrorReload data={state.error} refetch={fetchData} />
                                    :
                                    state.activeTab === 'friend' ?
                                        state.data.friend.length > 0 ?
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
                                                            Contact
                                                        </button>
                                                        <button>
                                                            Delete
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                            :
                                            <p>No friend can be found here !</p>
                                        :
                                        state.data.team.length > 0 ?
                                            state.data.team.map((item, index) => (
                                                <div className='card_team' key={index}>
                                                    <div className='header_team'>
                                                        <Image src={item.team_image || '/image/default.svg'} alt='' width={100} height={100} />
                                                        <div className='team_info'>
                                                            <h3>{item.team_name}</h3>
                                                            <div className='team_size'>
                                                                <h4>Size:</h4>
                                                                <p>{item.members.split(',').length}/{item.team_size}</p>
                                                            </div>
                                                            <div className='team_host'>
                                                                <h4>Host:</h4>
                                                                <p>{item.host_name}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className='team_members'>
                                                        <h4>Members:</h4>
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
                                                        {
                                                            item.is_host ?
                                                                <button>
                                                                    Delete
                                                                </button>
                                                                :
                                                                <button>
                                                                    Left
                                                                </button>
                                                        }
                                                        <button>
                                                            Join
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                            :
                                            <p>No team can be found here !</p>
                                }
                            </div>
                    }
                </div>
            </div>
            <div className='main_social' style={social.isShown ? { height: 'calc(100% - 70px)', transition: '0.2s all ease' } : { height: '60px', transition: '0.2s all ease' }}>
                <div className='heading_view'>
                    <div className='input_social'>
                        <input
                            type="text"
                            placeholder='Search'
                            autoComplete='off'
                            onFocus={() => {
                                if (!social.isShown) {
                                    setSocial(prev => ({ ...prev, isShown: true, pending: true }))
                                    fetchDataSocial()
                                }
                            }
                            }
                        />
                    </div>
                    {
                        social.isShown ?
                            <button
                                onClick={() => setSocial(prev => ({ ...prev, isShown: false }))}
                                style={{ background: 'var(--color_red)' }}
                            >
                                Close
                                <IoClose fontSize={16} />
                            </button>
                            :
                            <button
                                onClick={() => {
                                    setSocial(prev => ({ ...prev, isShown: true, pending: true }))
                                    fetchDataSocial()
                                }}
                                style={{ background: 'var(--color_black)' }}
                            >
                                Social
                                <TbWorld fontSize={16} />
                            </button>
                    }
                </div>
                {
                    social.isShown &&
                    <div className='view_social'>
                        {
                            social.pending ?
                                <LoadingContent scale={0.8} />
                                :
                                social.data.map((item, index) => (
                                    <div key={index} className='item_social'>
                                        <div className='tag_heading'>
                                            <button>
                                                <FaInfo fontSize={12} />
                                            </button>
                                            <h4>
                                                {item.username}
                                            </h4>
                                        </div>
                                        <button>
                                            <IoPersonAdd fontSize={16} />
                                        </button>
                                    </div>
                                ))
                        }
                    </div>
                }
            </div>
        </div>
    )
}