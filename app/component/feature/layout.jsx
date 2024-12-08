import { useState, useLayoutEffect } from "react"
import Navbar from "../home/navbar"
export default function Layout({ children, onReturn }) {
    const [onWidthDevice, setWidthOnDevice] = useState(false);
    const [onMobile, setOnMobile] = useState(false);
    const [sizeDevice, setSizeDevice] = useState({
        width: 0,
        height: 0
    })

    useLayoutEffect(() => {
        const handleResize = () => {
            setSizeDevice({
                width: window.innerWidth,
                height: window.innerHeight
            })
            setWidthOnDevice(window.innerWidth <= 768);
            setOnMobile(window.innerWidth <= 425);
        }

        window.addEventListener("resize", handleResize);

        handleResize();

        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return (
        <main id="main" style={{ flexDirection: "column", gap: '0'}}>
            <div id="header">
                <Navbar
                    sizeDevice={sizeDevice}
                    onMobile={onMobile}
                    onWidthDevice={onWidthDevice}
                    onReturn = {onReturn}
                />
            </div>
            <div className="body-container">
                {children}
            </div>
        </main>
    )
}