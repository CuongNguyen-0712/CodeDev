import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

import Navbar from './navbar';
import Dashboard from './dashboard';
import Content from './content';
import Feedback from './feedback';
import Manage from "./manage";

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
        }
    };

    useEffect(() => {
        document.addEventListener('mousedown', refDashboard);
        return () => {
            document.removeEventListener('mousedown', refDashboard);
        };
    }, [home.onHandle]);

    useEffect(() => {
        const isOverlay = !!(params.get('manage') || params.get('feedback'));

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
                        <Content redirect={() => setHome(prev => ({ ...prev, redirect: true }))} />
                    </div>
                    {
                        params.get('manage') &&
                        <div className='manage-container'>
                            <Manage redirect={() => setHome(prev => ({ ...prev, redirect: true, overlay: false }))} />
                        </div>
                    }
                    {
                        params.get('feedback') &&
                        <div className="feedback-container">
                            <Feedback />
                        </div>
                    }
                </>
                :
                <LoadingRedirect />
            }
        </main>
    );
} 