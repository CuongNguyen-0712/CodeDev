'use client'
import { createContext, useContext, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
    const params = useSearchParams();

    const [dashboard, setDashboard] = useState(false);
    const [redirect, setRedirect] = useState(false);
    const [alert, setAlert] = useState(null);

    // query params
    const feedback = params.get('feedback');
    const search = params.get('search');
    const manage = params.get('manage');

    // overlay logic
    useEffect(() => {
        const isOverlay = dashboard || feedback || search || manage;
        document.body.classList.toggle('overlay', !!isOverlay);
    }, [dashboard, feedback, search, manage]);

    useEffect(() => {
        if (redirect) {
            document.body.classList.remove('overlay');
        }
    }, [redirect]);

    // exposed API
    const value = {
        dashboard,
        setDashboard,

        redirect,
        setRedirect,

        alert,
        showAlert: (status, message, callback) =>
            setAlert({ status, message, callback }),

        clearAlert: () => setAlert(null),
    };

    return (
        <AppContext.Provider value={value}>
            {children}
        </AppContext.Provider>
    );
};

export const useApp = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error("useApp must be used inside AppProvider");
    }
    return context;
};