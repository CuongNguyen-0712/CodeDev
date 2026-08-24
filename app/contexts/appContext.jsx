'use client'
import { createContext, useContext, useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

const AppContext = createContext(null);

function SearchParamsListener({ onModalChange }) {
    const params = useSearchParams();
    const modal = params.get('modal');

    useEffect(() => {
        onModalChange(modal);
    }, [modal, onModalChange]);

    return null;
}

export const AppProvider = ({ children }) => {
    const [isDashboard, setDashboard] = useState(false);
    const [isAccountMobile, setAccountMobile] = useState(false);
    const [alert, setAlert] = useState(null);
    const [modal, setModal] = useState(null);

    useEffect(() => {
        const isOverlay = isDashboard || isAccountMobile || modal;
        document.body.classList.toggle('overlay', !!isOverlay);
    }, [isDashboard, isAccountMobile, modal]);

    const value = {
        isDashboard,
        setDashboard,
        isAccountMobile,
        setAccountMobile,
        alert,
        showAlert: (status, message, callback) =>
            setAlert({ status, message, callback }),

        clearAlert: () => setAlert(null),
    };

    return (
        <AppContext.Provider value={value}>
            <Suspense fallback={null}>
                <SearchParamsListener onModalChange={setModal} />
            </Suspense>
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