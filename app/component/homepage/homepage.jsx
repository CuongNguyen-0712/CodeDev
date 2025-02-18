import { useState, useLayoutEffect } from 'react';

import Navbar from './navbar';
import Dashboard from './dashboard'
import Content from '../home/content';
import LoadingWait from '@/app/lib/loadingWait';

import { useTheme } from '@/app/contexts/themeContext';
import { useSize } from '@/app/contexts/sizeContext';

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
                        />
                    </div>
                    <div className='frame'>
                        <div className='aside'>
                            <Dashboard
                                sizeDevice={sizeDevice}
                                handleRedirect={() => setRedirect(true)}
                            />
                        </div>
                        <div id='container'>
                            <Content />
                        </div>
                    </div>
                </>
                :
                <LoadingWait />
            }
        </main>
    );
} 