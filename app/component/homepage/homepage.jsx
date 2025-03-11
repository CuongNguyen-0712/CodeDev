import { useState, useRef, useEffect } from 'react';

import Navbar from '../home/navbar';
import Dashboard from './dashboard'
import Content from '../home/content';
import { LoadingRedirect } from '../ui/loading';


export default function HomePage() {

    const ref = useRef(null);

    const [home, setHome] = useState({
        overlay: false,
        dashboard: false,
        switchMode: true,
        setLogout: false,
    })

    const refDashboard = (e) => {
        if (!ref.current) return;

        if (ref.current && !ref.current.contains(e.target)) {
            setHome(prev => ({ ...prev, dashboard: false, overlay: false }));
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', refDashboard)

        return () => {
            document.removeEventListener('mousedown', refDashboard)
        }
    }, [])

    const [redirect, setRedirect] = useState(false);

    return (
        <main id='home'>
            {!redirect ?
                <>
                    <div id='header'>
                        <Navbar
                            handleDashboard={() => setHome(prev => ({ ...prev, dashboard: true, overlay: true }))}
                        />
                    </div>
                    <div className='aside' style={home.dashboard ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }} ref={ref}>
                        <Dashboard
                            handleDashboard={() => setHome(prev => ({ ...prev, dashboard: false, overlay: false }))}
                            handleRedirect={() => setRedirect(true)}
                        />
                    </div>
                    <div id='container'>
                        <Content />
                    </div>
                </>
                :
                <LoadingRedirect />
            }
        </main>
    );
} 