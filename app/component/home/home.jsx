'use client'
import { useState, useEffect } from 'react';

import Navbar from './navbar';
import MenuSite from './menuSite';
import Content from './content';
import LoadingWait from '../feature/loadingWait';

import { useAuth } from '../auth/handleAuth/authContext';

import { IoHomeSharp } from "react-icons/io5";
import { HiLogout } from "react-icons/hi";

export default function HomePage() {

    const [home, setHome] = useState({
        targetContentItem: 0,
        switchMode: true,
        setLogout: false,
    })

    const [isSwitchPath, setSwitchPath] = useState(false);

    if(isSwitchPath) return <LoadingWait />

    return (
        <main id='main'>
            <div className="aside">
                <MenuSite
                    handleSetContent = {(index) => setHome({ ...home, targetContentItem: index })}
                    handleSwitchPath = {() => setSwitchPath(true)}  
                />
            </div>
            <div className="frame">
                <div id='header'>
                    <Navbar/>
                </div>
                <div id='container'>
                    <Content
                        target={home.targetContentItem}
                    />
                </div>
            </div>
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