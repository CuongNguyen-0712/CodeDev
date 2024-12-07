import { useState, useLayoutEffect } from 'react';

import Navbar from './navbar';
import MenuSite from './menuSite';
import Content from './content';
import LoadingWait from '../feature/loadingWait';

import { useAuth } from '../auth/handleAuth/authContext';

import { IoHomeSharp } from "react-icons/io5";
import { HiLogout } from "react-icons/hi";

export default function HomePage() {
    const [onWidthDevice, setWidthOnDevice] = useState(false);
    const [onHeightDevice, setHeightOnDevice] = useState(false);

    const [onMobile, setOnMobile] = useState(false);

    useLayoutEffect(() => {
        const handleResize = () => {
            setWidthOnDevice(window.innerWidth <= 768);
            setHeightOnDevice(window.innerHeight <= 600);
            setOnMobile(window.innerWidth <= 425);
        }

        window.addEventListener("resize", handleResize);

        handleResize();

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const [home, setHome] = useState({
        targetContentItem: 0,
        resize: true,
        switchMode: true,
        setLogout: false,
    })

    const [isSwitchPath, setSwitchPath] = useState(false);

    if (isSwitchPath) return <LoadingWait />

    console.log(onHeightDevice)

    return (
        <main id='main'>
            <div className={`aside ${(onWidthDevice && !home.resize) ? 'active' : ''}`}>
                <MenuSite
                    onHeightDevice = {onHeightDevice}
                    handleSetContent={(index) => setHome({ ...home, targetContentItem: index })}
                    handleSwitchPath={() => setSwitchPath(true)}
                />
            </div>
            <div className={`frame ${(onWidthDevice && !home.resize) ? 'hide' : ''}`} onClick={() => { !home.resize && setHome({ ...home, resize: true }) }}>
                <div id='header'>
                    <Navbar
                        onMobile ={onMobile}
                        onWidthDevice={onWidthDevice}
                        handleResize={() => setHome({ ...home, resize: false })}
                    />
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