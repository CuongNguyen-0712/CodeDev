'use client'
import { useContext, createContext, useState, useLayoutEffect } from "react";

const SizeContext = createContext();

export const SizeProvider = ({ children }) => {
    const [size, setSize] = useState({width: 0, height: 0});

    useLayoutEffect(() => {
        const handleResize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;

            setSize({
                width: currentWidth,
                height: currentHeight
            })
        }
        
        handleResize();

        window.addEventListener("resize", handleResize);

        return () => {
            window.removeEventListener("resize", handleResize);    
        }
    }, [])

    return(
        <SizeContext.Provider value={{size}}>
            {children}
        </SizeContext.Provider>
    )   
}

export const useSize = () => useContext(SizeContext);