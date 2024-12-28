import { useEffect, useState, useContext, createContext } from "react"
import { useRouter } from 'next/navigation';

const AuthContext = createContext();

export const useAuth = () => {
    return useContext(AuthContext);
}

export const AuthProvider = ({ children }) => {
    

    return (
        <AuthContext.Provider>
            {children}
        </AuthContext.Provider>
    )
}