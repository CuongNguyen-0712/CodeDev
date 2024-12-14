import { useState, useLayoutEffect } from "react"
import Navbar from "../home/navbar"
export default function Layout({ children, onReturn, size}) {
    const [device, onDevice] = useState({
        onMobile: false,
        onIpad: false,
        onLaptop: false,
    })

    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0
    })

    useLayoutEffect(() => {
        const handleResize = () => {
            const currentWidth = window.innerWidth;
            const currentHeight = window.innerHeight;

            onDevice({
                onMobile: currentWidth <= 425,
                onIpad: currentWidth > 425 && currentWidth <= 768,
                onLaptop: currentWidth > 768
            })

            setSizeDevice({
                width: currentWidth,
                height: currentHeight
            })

            size({ width: currentWidth, height: currentHeight })
        }
        
        handleResize();
        
        window.addEventListener("resize", handleResize);

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <main id="main" style={{ flexDirection: "column", gap: '0' }}>
            <div id="header">
                <Navbar
                    sizeDevice={sizeDevice}
                    onMobile={device.onMobile}
                    onIpad={device.onIpad}
                    onReturn={onReturn}
                />
            </div>
            {children}
        </main>
    )
}