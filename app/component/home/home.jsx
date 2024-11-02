'use client'

import { useState } from 'react';

import Navbar from './navbar';
import Dashboard from './dashboard';
import Content from './content';
import LoadingWait from '../feature/loadingWait';

import { useAuth } from '../auth/handleAuth/authContext';

import { IoHomeSharp } from "react-icons/io5";
import { HiLogout } from "react-icons/hi";

export default function HomePage() {

    const [home, setHome] = useState({
        dashboard: true,
        isResize: false,
        targetContentItem: 1,
        switchMode: true,
        setLogout: false,
    })

    const [isSwitchPath, setSwitchPath] = useState(false);

    if (isSwitchPath) return <LoadingWait />

    return (
        <main id='main'>
            <div className={`aside ${home.isResize ? 'resize' : ''}`}>
                <Dashboard
                    mode={home.switchMode}
                    isDashboard={home.dashboard}
                    isResize={home.isResize}
                    handleMode={() => setHome((prev) => ({ ...prev, switchMode: !prev.switchMode }))}
                    handleContent={(key) => setHome((prev) => ({ ...prev, targetContentItem: key }))}
                />
            </div>
            <div className={`frame ${home.isResize ? 'resize' : ''}`}>
                <div id='header'>
                    <Navbar
                        handleResize={() => setHome((prev) => ({ ...prev, isResize: !prev.isResize }))}
                        handleChange={() => setSwitchPath(true)}
                        isResize={home.isResize}
                    />
                </div>
                <div id='container'>
                    <Content
                        target={home.targetContentItem}
                        isComment={home.comment}
                    />
                </div>
            </div>
            {/* <article className={`frame-comment ${home.comment ? 'active' : ''}`}>

                    </article>
                     */}
            {home.setLogout &&
                <div className='logoutSheet'>
                    <div className='logout-container'>
                        <span>Do you want to logout ?</span>
                        <div className='handleChoose'>
                            <button onClick={() => setHome({ ...home, setLogout: false })}>
                                <IoHomeSharp />
                            </button>
                            <button onClick={() => alert("Dang sua")}>
                                <HiLogout />
                            </button>
                        </div>
                    </div>
                </div>
            }
        </main>
    );
} 