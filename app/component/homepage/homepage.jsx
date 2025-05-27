import { useState, useRef, useEffect } from 'react';
import { useRouterActions } from '@/app/router/router';

import Navbar from '../home/navbar';
import Dashboard from './dashboard'
import Content from './content';
import { LoadingRedirect } from '../ui/loading';

export default function HomePage() {
    const { navigateToAuth } = useRouterActions();
    const ref = useRef(null);

    const [state, setState] = useState({
        overlay: false,
        dashboard: false,
        redirect: false,
    })

    const handleRedirect = () => {
        setState(prev => ({ ...prev, redirect: true, overlay: false }));
        navigateToAuth();
    }

    const refDashboard = (e) => {
        if (!ref.current) return;

        if (ref.current && !ref.current.contains(e.target)) {
            setState(prev => ({ ...prev, dashboard: false, overlay: false }));
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', refDashboard)
        return () => {
            document.removeEventListener('mousedown', refDashboard)
        }
    }, [])

    useEffect(() => {
        document.body.style.overflow = state.overlay ? "hidden" : "unset";
    }, [state.overlay]);

    return (
        <main id='home' className={state.overlay ? 'overlay' : ''}>
            {!state.redirect ?
                <>
                    <div id='header'>
                        <Navbar
                            handleDashboard={() => setState(prev => ({ ...prev, dashboard: true, overlay: true }))}
                            handleRedirect={handleRedirect}
                        />
                    </div>
                    <div className='aside' style={state.dashboard ? { transform: 'translateX(0)' } : { transform: 'translateX(-100%)' }} ref={ref}>
                        <Dashboard
                            handleDashboard={() => setState(prev => ({ ...prev, dashboard: false, overlay: false }))}
                            handleRedirect={handleRedirect}
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