'use client'

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

const Study = dynamic(() => import('../content/study/Study'), { ssr: false });
const Roadmap = dynamic(() => import('../content/roadmap/Roadmap'), { ssr: false });
const Social = dynamic(() => import('../content/social/Social'), { ssr: false });
const Ranking = dynamic(() => import('../content/ranking/Ranking'), { ssr: false });
const Benefit = dynamic(() => import('../content/benefit/Benefit'), { ssr: false });

const Member = dynamic(() => import('../member/studyMember'), { ssr: false });

import { useAuth } from '../auth/handleAuth/authContext';
import Loading from '@/app/function/loading';

import { IoCaretDownSharp, IoCaretUpSharp, IoHomeSharp } from "react-icons/io5";
import { PiStudentFill } from 'react-icons/pi';
import { SiGnusocial } from 'react-icons/si';
import { GiReceiveMoney } from "react-icons/gi"
import { GoProjectRoadmap } from "react-icons/go";
import { FaRankingStar } from 'react-icons/fa6';
import { FiMoon, FiSun } from "react-icons/fi";
import { RiAccountCircleFill, RiExpandLeftLine, RiExpandRightLine, RiInformationFill, RiShutDownLine } from "react-icons/ri";
import { MdOutlinePlaylistPlay, MdOutlinePlaylistRemove, MdSettings} from "react-icons/md";
import { HiLogout } from "react-icons/hi";

export default function HomePage() {
    const { handleLogout } = useAuth();
    const router = useRouter();

    const [home, setHome] = useState({
        isShownNavbar: true,
        currentTarget: 1,
        currentId: null,
        currentName: null,
        currentNameTarget: null,
        setCurrnetTarget: false,
        dashboard: true,
        expandDashboard: true,
        member: false,
        comment: false,
        switchMode: true,
        setLogout: false,
    })

    const [showProperties, setShowOption] = useState(false);
    const [isSwitchPath, setSwitchPath] = useState(false);
    const [target, setTarget] = useState('');

    const links = [
        { name: 'Dashboard', caseId: 1 },
        { name: 'Member', caseId: 2 },
        { name: 'Comment', caseId: 3 },
    ];

    const contentTitles = [
        {
            id: 1,
            name: 'Study',
            icon: <PiStudentFill />,
            content: <Study />,
            list:
                [
                    {
                        id: 'js',
                        name: 'JAVASCRIPT',
                    },
                    {
                        id: 'reactjs',
                        name: 'REACTJS',
                    },
                    {
                        id: 'nextjs',
                        name: 'NEXTJS',
                    },
                    {
                        id: 'vuejs',
                        name: 'VUEJS',
                    },
                    {
                        id: 'nodejs',
                        name: 'NODEJS',
                    },
                    {
                        id: 'go',
                        name: 'GOLANG',
                    },
                    {
                        id: 'dart',
                        name: "DART",
                    },
                    {
                        id: 'swift',
                        name: "SWIFT",
                    },
                    {
                        id: 'rust',
                        name: "RUST",
                    },
                    {
                        id: 'ruby',
                        name: "RUBY",
                    },
                    {
                        id: 'python',
                        name: "PYTHON",
                    }
                ]
        },
        {
            id: 2,
            name: 'Roadmap',
            icon: <GoProjectRoadmap />,
            content: <Roadmap />,
            list:
                [
                    {
                        name: "BEGINNER"
                    },
                    {
                        name: "INTERMEDIATE"
                    },
                    {
                        name: "ADVANCED"
                    },
                ]
        },
        {
            id: 3,
            name: 'Social',
            icon: <SiGnusocial />,
            content: <Social />,
            list:
                [
                    {
                        name: "FACEBOOK"
                    },
                    {
                        name: "INSTAGRAM"
                    },
                    {
                        name: "TWITTER"
                    },
                    {
                        name: "YOUTUBE"
                    }
                ]
        },
        {
            id: 4,
            name: 'Ranking',
            icon: <FaRankingStar />,
            content: <Ranking />,
            list: [
                {
                    name: "INTERN"
                },
                {
                    name: "JUNIOR"
                },
                {
                    name: "FREELANCER"
                },
                {
                    name: "SENIOR"
                }
            ]
        },
        {
            id: 5,
            name: 'Benefit',
            icon: <GiReceiveMoney />,
            content: <Benefit />,
            list:
                [
                    {
                        name: "SCHOOL",
                    },
                    {
                        name: "WORK",
                    }
                ]
        }
    ];

    const handleChangePage = (key) => {
        const newState = (() => {
            switch (key) {
                case 1:
                    return {
                        dashboard: true,
                        member: false,
                        comment: false,
                        expandDashboard: true,
                    };
                case 2:
                    return {
                        dashboard: false,
                        member: true,
                        comment: false,
                        expandDashboard: false,
                    };
                case 3:
                    return {
                        dashboard: false,
                        member: false,
                        comment: true,
                        expandDashboard: false,
                    };
                default:
                    return {
                        dashboard: true,
                        member: false,
                        comment: false,
                        expandDashboard: true,
                    };
            }
        })();

        setHome((prev) => ({
            ...prev,
            currentTarget: key,
            ...newState,
        }))
    };

    const handleChangedTitle = ({ id, name }) => {
        setHome((prev) => ({
            ...prev,
            currentTarget: 1,
            currentId: (id === prev.currentId ? null : id),
            currentName: (name === prev.currentName ? null : name),
            currentNameTarget: (name === prev.currentNameTarget ? null : name),
            dashboard: true,
            member: false,
            comment: false,
        }))

        setTarget('');
    }

    const handleCloseMember = () => {
        setHome((prev) => ({
            ...prev,
            member: false,
            currentTarget: null,
        }))
    }

    const handleSwitchPath = async (path) => {
        setSwitchPath(true);
        router.push(path);
    }

    const submitLogout = () => {
        setHome((state) => ({
            ...state,
            setLogout: true,
        }))
    }

    const handleScrollBehavior = (id) => {
        setTarget(id);
        const element = document.getElementById(id);
        if (element) {
            element.scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            })
        }
    }

    return (
        <main id='main'>
            {isSwitchPath ? (
                <Loading />
            ) : (
                <>
                    <nav id='navbar'>
                        <div className={`navbar-items ${home.isShownNavbar ? 'show' : ''}`}>
                            {links.map((link) => (
                                <button key={link.caseId}
                                    className={`btns ${home.currentTarget === link.caseId ? 'effect' : ''}`}>
                                    <span className='btn' onClick={() => handleChangePage(link.caseId)}>
                                        {link.name}
                                    </span>
                                </button>
                            ))}
                            <span id='targetItem'></span>
                        </div>
                        <div className="function">
                            <span className={`list-navbar ${home.isShownNavbar ? 'show' : 'hide'}`} onClick={() => setHome((prev) => ({ ...prev, isShownNavbar: !prev.isShownNavbar }))}>
                                {home.isShownNavbar ? <MdOutlinePlaylistRemove /> : <MdOutlinePlaylistPlay />}
                            </span>
                            <span className={`account ${showProperties ? 'show' : 'hide'}`} onClick={() => setShowOption(!showProperties)}>
                                <RiAccountCircleFill />
                            </span>
                            {showProperties && (
                                <ul className='account-properties'>
                                    <li onClick={() => handleSwitchPath('/infomation')}>
                                        <span className='properties-icon'><RiInformationFill /></span>
                                        <span className='properties-name'>Infomation</span>
                                    </li>
                                    <li onClick={() => handleSwitchPath('/settings')}>
                                        <span className='properties-icon'><MdSettings /></span>
                                        <span className='properties-name'>Settings</span>
                                    </li>
                                    <li onClick={() => submitLogout()}>
                                        <span className='properties-icon'><RiShutDownLine /></span>
                                        <span className='properties-name'>Logout</span>
                                    </li>
                                </ul>
                            )}
                        </div>
                    </nav>
                    <div className={`dashboard-target ${home.dashboard && home.expandDashboard ? 'expand' : 'compact'}`} data-text={home.currentNameTarget}>
                        <div id='header-dashboard'>
                            <span className='resize' onClick={() => setHome((state) => ({ ...state, expandDashboard: !state.expandDashboard, dashboard: true, member: false, comment: false, currentTarget: 1 }))}>
                                {home.expandDashboard ? <RiExpandLeftLine /> : <RiExpandRightLine />}
                            </span>
                            <h1>Dashboard</h1>
                        </div>
                        <div id='main-dashboard'>
                            {contentTitles.map((item) => (
                                <div className='container-dashboard' key={item.id}>
                                    <button className={`dashboardTitle ${item.id === home.currentId ? 'active' : ''}`}
                                        onClick={() => handleChangedTitle({ id: item.id, name: item.name })}
                                        onMouseEnter={() => setHome({ ...home, currentNameTarget: item.name })}
                                        onMouseLeave={() => setHome({ ...home, currentNameTarget: home.currentName })}>
                                        <span className='icon'>{item.icon}</span>
                                        <div className='box-container'>
                                            <span className='name'>{item.name}</span>
                                            <span className='extend'>{item.id === home.currentId ? <IoCaretUpSharp /> : <IoCaretDownSharp />}</span>
                                        </div>
                                    </button>
                                    <ul className={`list ${item.id === home.currentId ? 'show' : 'hide'}`} style={{ '--length': `${item.list.length}` }}>
                                        {item.list.map((listItem) => (
                                            <li key={listItem.name}
                                                onClick={() => handleScrollBehavior(listItem.id)}
                                                className={listItem.id === target ? 'active' : ''}
                                            >
                                                {listItem.name}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <footer id='footer-dashboard'>
                            <div className={`switchMode ${home.switchMode ? 'light' : 'dark'}`}>
                                <span className='mode'>{home.switchMode ? 'Light mode:' : 'Dark mode:'}</span>
                                <button className='mode-btn' onClick={() => setHome({ ...home, switchMode: !home.switchMode })}>
                                    <span>{home.switchMode ? <FiSun /> : <FiMoon />}</span>
                                </button>
                            </div>
                        </footer>
                    </div>

                    <article id='content-layout'>
                        <div className={`frame-content ${home.dashboard && home.expandDashboard ? 'effect1' : ''} ${home.comment ? 'effect2' : ''}`}>
                            {contentTitles.map((item) => (
                                <article key={item.id} className={`content-item ${home.currentId === item.id ? 'show' : 'hide'}`}>
                                    {item.content}
                                </article>
                            ))}
                        </div>
                    </article>

                    <article className={`frame-comment ${home.comment ? 'active' : ''}`}>

                    </article>
                    <article className={`member-template ${home.member ? 'active' : ''}`}>
                        <Member handle={() => handleCloseMember()} />
                    </article>
                </>
            )}
            {home.setLogout &&
                <div className='logoutSheet'>
                    <div className='logout-container'>
                        <span>Do you want to logout ?</span>
                        <div className='handleChoose'>
                            <button onClick={() => setHome({ ...home, setLogout: false })}>
                                <IoHomeSharp />
                            </button>
                            <button onClick={handleLogout}>
                                <HiLogout />
                            </button>
                        </div>
                    </div>
                </div>
            }
        </main>
    );
} 