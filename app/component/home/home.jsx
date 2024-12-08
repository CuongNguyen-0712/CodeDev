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

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0
    })

    useLayoutEffect(() => {
        const handleResize = () => {
            setSizeDevice({
                width: window.innerWidth,
                height: window.innerHeight
            })
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
        overlay: false,
        switchMode: true,
        setLogout: false,
    })

    const [isSwitchPath, setSwitchPath] = useState(false);

    if (isSwitchPath) return <LoadingWait />

    return (
        <main id='main'>
            <div className={`aside ${(onWidthDevice && home.overlay) ? 'active' : ''}`}>
                <MenuSite
                    onHeightDevice={onHeightDevice}
                    handleSetContent={(index) => setHome({ ...home, targetContentItem: index })}
                    handleSwitchPath={() => setSwitchPath(true)}
                />
            </div>
            <div className={`frame ${(onWidthDevice && home.overlay) ? 'hide' : ''}`} onClick={() => { home.overlay && setHome({ ...home, overlay: false }) }}>
                <div id='header'>
                    <Navbar
                        sizeDevice={sizeDevice}
                        onMobile={onMobile}
                        onWidthDevice={onWidthDevice}
                        handleOverlay={() => setHome({ ...home, overlay: true })}
                    />
                </div>
                <div id='container'>
                    <Content
                        target={home.targetContentItem}
                    />
                </div>
            </div>
        </main>
    );
} 