'use client'
import { createContext, useContext, useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const AppContext = createContext(null);

export const AppProvider = ({ children }) => {
    const params = useSearchParams();

    const [overlay, setOverlay] = useState(false);
    const [alert, setAlert] = useState(null);

    const modal = params.get('modal');

    useEffect(() => {
        const isOverlay = overlay || modal;
        document.body.classList.toggle('overlay', !!isOverlay);
    }, [overlay, modal]);

    const value = {
        overlay,
        setOverlay,

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