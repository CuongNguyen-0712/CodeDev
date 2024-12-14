import { useState, useLayoutEffect, useRef } from 'react';

import Navbar from './navbar';
import MenuSite from './menuSite';
import Content from './content';
import LoadingWait from '../feature/loadingWait';

import { useAuth } from '../auth/handleAuth/authContext';

export default function HomePage() {
    const [device, onDevice] = useState({
        onMobile: false,
        onIpad: false,
        onLaptop: false,
    })

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0
    })

    useLayoutEffect(() => {
        const handleResize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;

            onDevice({
                onMobile: currentWidth <= 425,
                onIpad: currentWidth > 425 && currentWidth <= 768,
                onLaptop: currentWidth > 768
            })

            setSizeDevice({
                width: currentWidth,
                height: currentHeight
            })
        }

        handleResize();

        window.addEventListener("resize", handleResize);

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
            <div className={`aside ${(sizeDevice.width < 768 && home.overlay) ? 'active' : ''}`}>
                <MenuSite
                    sizeDevice={sizeDevice}
                    handleSetContent={(index) => setHome({ ...home, targetContentItem: index })}
                    handleSwitchPath={() => setSwitchPath(true)}
                />
            </div>
            <div className={`frame ${(sizeDevice.width < 768 && home.overlay) ? 'hide' : ''}`} onClick={() => { home.overlay && setHome({ ...home, overlay: false }) }}>
                <div id='header'>
                    <Navbar
                        sizeDevice={sizeDevice}
                        onMobile={device.onMobile}
                        onIpad={device.onIpad}
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