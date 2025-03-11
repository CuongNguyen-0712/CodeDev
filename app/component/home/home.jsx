import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import Navbar from './navbar';
import Dashboard from './dashboard';
import Content from './content';
import Manage from "./manage";

import { LoadingRedirect } from '@/app/component/ui/loading';

export default function Home() {
    const ref = useRef();
    const params = useSearchParams();

    const [home, setHome] = useState({
        dashboard: false,
        manage: false,
        overlay: false,
        redirect: false,
        setLogout: false,
    })

    useEffect(() => {
        const onManage = params.get('manage');
        if (onManage) {
            setHome(prev => ({
                ...prev,
                manage: onManage === 'true',
                dashboard: false,
                overlay: false,
            }));
        }
        else {
            setHome(prev => ({
                ...prev,
                manage: false,
            }));
        }

    }, [params]);

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

    useEffect(() => {
        document.body.style.overflow = (home.overlay || home.manage) ? "hidden" : "unset";
    }, [home.overlay, home.manage]);

    return (
        <main id='home' className={home.overlay ? 'overlay' : ''}>
            {!home.redirect ?
                <>
                    <div id='header'>
                        <Navbar
                            handleDashboard={() => setHome(prev => ({ ...prev, dashboard: true, overlay: true }))}
                            onHome={false}
                        />
                    </div>
                    <div className='aside' style={home.dashboard ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }} ref={ref}>
                        <Dashboard
                            handleDashboard={() => setHome(prev => ({ ...prev, dashboard: false, overlay: false }))}
                        />
                    </div>
                    <div id='container'>
                        <Content />
                    </div>
                    {
                        home.manage &&
                        <div className='manage-overlay'>
                            <Manage />
                        </div>
                    }
                </>
                :
                <LoadingRedirect />
            }
        </main>
    );
} 