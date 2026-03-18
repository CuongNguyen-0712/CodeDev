'use client'
import { useState, useEffect, cloneElement } from 'react';

import { useSearchParams } from "next/navigation";

import Navbar from '../component/home/navbar';
import Dashboard from '../component/home/dashboard';
import Manage from '../component/home/manage';
import Feedback from '../component/home/feedback';

import AlertPush from '../component/ui/alert';

import { LoadingRedirect } from '@/app/component/ui/loading';

export default function BaseLayout({ children }) {
    const params = useSearchParams();
    const [state, setState] = useState({
        dashboard: false,
        redirect: false,
    });

    const [alert, setAlert] = useState(null)

    const feedback = params.get('feedback');
    const search = params.get('search');
    const manage = params.get('manage');

    useEffect(() => {
        const isOverlay = state.dashboard || feedback || search || manage;

        if (isOverlay) {
            document.body.classList.add('overlay');
        } else {
            document.body.classList.remove('overlay');
        }
    }, [state.dashboard, feedback, search, manage]);

    useEffect(() => {
        if (!state.redirect) return;
        document.body.classList.remove('overlay');
    }, [state.redirect]);

    return state.redirect ?
        <LoadingRedirect />
        :
        <main id='main'>
            <Navbar
                handleDashboard={(value) => setState(prev => ({ ...prev, dashboard: value }))}
                redirect={(value) => setState(prev => ({ ...prev, redirect: value }))}
            />
            <Dashboard
                isDashboard={state.dashboard}
                handleDashboard={(value) => setState(prev => ({ ...prev, dashboard: value }))}
                redirect={(value) => setState(prev => ({ ...prev, redirect: value }))}
            />
            <section id='container'>
                {cloneElement(children, {
                    alert: (status, message, callback) => setAlert({ status, message, callback }),
                    redirect: (value) => setState(prev => ({ ...prev, redirect: value }))
                })}
            </section>
            <Manage
                redirect={(value) => setState(prev => ({ ...prev, redirect: value }))}
                alert={(status, message, callback) => setAlert({ status, message, callback })}
            />
            <Feedback
                alert={(status, message, callback) => setAlert({ status, message, callback })}
            />
            <AlertPush
                status={alert?.status}
                message={alert?.message}
                reset={() => setAlert(null)}
                callback={alert?.callback}
            />
        </main>
} 