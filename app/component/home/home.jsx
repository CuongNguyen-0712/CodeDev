import { useState, useLayoutEffect, useRef, useEffect } from 'react';

import Navbar from './navbar';
import Dashboard from './dashboard';
import Content from './content';

import LoadingWait from '@/app/lib/loadingWait';

import { useSize } from '@/app/contexts/sizeContext';

export default function Home() {
    const { size } = useSize()

    const ref = useRef();

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

    const refMenu = (e) => {
        if (ref.current && !ref.current.contains(e.target)) {
            setHome({ ...home, menu: false })
        }
    }

    useEffect(() => {
        document.addEventListener('mousedown', refMenu)

        return () => {
            document.removeEventListener('mousedown', refMenu)
        }
    }, [])

    const [home, setHome] = useState({
        menu: false,
        targetContentItem: 0,
        overlay: false,
        switchMode: true,
        setLogout: false,
    })

    const [redirect, setRedirect] = useState(false);

    return (
        <main id='home'>
            {!redirect ?
                <>
                    <div id='header'>
                        <Navbar
                            sizeDevice={sizeDevice}
                            onMobile={device.onMobile}
                            onIpad={device.onIpad}
                            handleMenu={() => setHome({ ...home, menu: !home.menu })}
                            handleOverlay={() => setHome({ ...home, overlay: true })}
                            handleFeedback={() => setHome({ ...home, onFeedback: true })}
                        />
                    </div>
                    <div className='aside' style={home.menu ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }} ref={ref}>
                        <Dashboard
                            sizeDevice={sizeDevice}
                            handleMenu={() => setHome({ ...home, menu: false })}
                            handleSetContent={(index) => setHome({ ...home, targetContentItem: index })}
                            handleRedirect={() => setRedirect(true)}
                        />
                    </div>
                    <div id='container'>
                        <Content />
                    </div>
                </>
                :
                <LoadingWait />
            }
        </main>
    );
} 