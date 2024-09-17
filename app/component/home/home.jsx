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
import { FaArrowRight, FaRankingStar } from 'react-icons/fa6';
import { FiMoon, FiSun } from "react-icons/fi";
import { RiAccountCircleFill, RiExpandLeftLine, RiExpandRightLine, RiInformationFill } from "react-icons/ri";
import { MdOutlinePlaylistPlay, MdOutlinePlaylistRemove, MdLogout, MdSettings, MdHelp } from "react-icons/md";
import { GrLogout } from "react-icons/gr";


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
    }

    const handleCloseUser = () => {
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
                                    <li onClick={() => handleSwitchPath('/help')}>
                                        <span className='properties-icon'><MdHelp /></span>
                                        <span className='properties-name'>Help</span>
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
                                            <a key={listItem.name} href={`#${listItem.id}`}>
                                                <li>{listItem.name}</li>
                                            </a>
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <footer id='footer-dashboard'>
                            <div className='handleLogout'>
                                <button className='logout-btn' onClick={() => submitLogout()}>
                                    {home.dashboard && home.expandDashboard ? "Logout" : <MdLogout />}
                                </button>
                            </div>
                            <div className={`switchMode ${home.switchMode ? 'light' : 'dark'}`}>
                                <span className='mode'>{home.switchMode ? 'Light mode:' : 'Dark mode:'}</span>
                                <button className='mode-btn' onClick={() => setHome({ ...home, switchMode: !home.switchMode })}>
                                    <span>{home.switchMode ? <FiSun /> : <FiMoon />}</span>
                                </button>
                            </div>
                        </footer>
                    </div>

                    <div id='content-layout'>
                        <div className={`frame-content ${home.dashboard && home.expandDashboard ? 'effect1' : ''} ${home.member ? 'effect2' : ''}`}>
                            {contentTitles.map((item) => (
                                <article key={item.id} className={`content-item ${home.currentId === item.id ? 'show' : 'hide'}`}>
                                    {item.content}
                                </article>
                            ))}
                        </div>
                    </div>

                    <div className={`member-template ${home.member ? 'active' : ''}`}>
                        <div className='member-header'>
                            <h1 className="member-head">Member</h1>
                            <span className="close-member" onClick={handleCloseUser}><FaArrowRight /></span>
                        </div>
                        <div className='member-container'>
                            <Member />
                        </div>
                    </div>
                </>
            )}
            {home.setLogout &&
                <div className='logoutSheet'>
                    <div className='logout-container'>
                        <span>Do you want to logout ?</span>
                        <div className='handleChoose'>
                            <button id='deline' onClick={() => setHome({ ...home, setLogout: false })}>
                                <IoHomeSharp />
                            </button>
                            <button id='accept' onClick={handleLogout}>
                                <GrLogout />
                            </button>
                        </div>
                    </div>
                </div>
            }
        </main>
    );
} 