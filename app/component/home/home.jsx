import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';


import Navbar from './navbar';
import Dashboard from './dashboard';
import Content from './content';
import Feedback from './feedback';
import Manage from "./manage";
import Search from './search';

import { LoadingRedirect } from '@/app/component/ui/loading';

export default function Home() {
    const ref = useRef();
    const params = useSearchParams();

    const [home, setHome] = useState({
        dashboard: false,
        onHandle: false,
        redirect: false,
        overlay: false,
    });

    const refDashboard = (e) => {
        if (!ref.current) return;

        const isOutside = !ref.current.contains(e.target);

        if (isOutside && !home.onHandle) {
            setHome(prev => ({
                ...prev,
                dashboard: false,
                overlay: false
            }));
            document.body.style.overflow = 'unset';
        }
    };

    const handleDashboard = () => {
        setHome(prev => ({
            ...prev,
            dashboard: true,
            overlay: true,
        }));
        document.body.style.overflow = 'hidden';
    };

    useEffect(() => {
        document.addEventListener('mousedown', refDashboard);
        return () => {
            document.removeEventListener('mousedown', refDashboard);
        };
    }, [home.onHandle, home.dashboard]);

    useEffect(() => {
        const overlayParams = ['manage', 'feedback', 'search'];
        const isOverlay = overlayParams.some(key => params.get(key));

        setHome(prev => ({
            ...prev,
            dashboard: false,
            overlay: isOverlay,
            onHandle: isOverlay
        }));

        document.body.style.overflow = isOverlay ? 'hidden' : 'unset';
    }, [params]);

    return (
        <main id='home' className={home.overlay ? 'overlay' : ''}>
            {!home.redirect ?
                <>
                    <div id='header'>
                        <Navbar
                            handleDashboard={handleDashboard}
                            handleRedirect={(value) => setHome(prev => ({ ...prev, redirect: value }))}
                        />
                    </div>
                    <div className='aside' style={home.dashboard ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }} ref={ref}>
                        <Dashboard
                            handleDashboard={() => setHome(prev => ({ ...prev, dashboard: false, overlay: false }))}
                            isDashboard={home.dashboard}
                        />
                    </div>
                    <div id='container'>
                        <Content
                            handleRedirect={(value) => setHome(prev => ({ ...prev, redirect: value }))}
                        />
                    </div>
                    {
                        params.get('manage') &&
                        <div className='manage_container'>
                            <Manage redirect={() => setHome(prev => ({ ...prev, redirect: true, overlay: false }))} />
                        </div>
                    }
                    {
                        params.get('feedback') &&
                        <div className="feedback_container">
                            <Feedback />
                        </div>
                    }
                    {
                        params.get('search') &&
                        <div className="search_container">
                            <Search redirect={() => setHome(prev => ({ ...prev, redirect: true, overlay: false }))} />
                        </div>
                    }
                </>
                :
                <LoadingRedirect />
            }
        </main>
    );
} 