import { useState, useEffect } from "react";

const handleCheckKeyDown = (key) => {
    const [isCapsLock, setIsCapsLock] = useState(false);

    useEffect(() => {
        const handleCheckCapsLock = (event) => {
            if (event.getModifierState(`${key}`)) {
                setIsCapsLock(true);
            }
            else {
                setIsCapsLock(false);
            }
        }
        window.addEventListener("keydown", handleCheckCapsLock);

        return () => {
            window.removeEventListener("keydown", handleCheckCapsLock);
        }
    }, [])

    return isCapsLock;
}

export default handleCheckKeyDown