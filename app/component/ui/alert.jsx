import { useState, useEffect } from "react";

import { IoWarning, IoCloseCircle, IoCheckmarkCircle, IoInformationCircle } from "react-icons/io5";

export default function AlertPush({ status = 0, message = '', reset, callback = null }) {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        if (!message) return;

        setVisible(true);

        const timer = setTimeout(() => {
            setVisible(false);
            reset()
        }, 2000);

        return () => clearTimeout(timer);
    }, [message]);

    return visible ? (
        <div
            id="alert"
        >
            {
                ({
                    0: <IoInformationCircle fontSize={16} color="var(--color_blue)" />,
                    200: <IoCheckmarkCircle fontSize={16} color='var(--color_green)' />,
                    500: <IoCloseCircle fontSize={16} color="var(--color_red_light)" />,
                }[status] || <IoWarning fontSize={16} color="var(--color_orange)" />)
            }
            <p>{message}</p>
            {
                callback &&
                <button
                    onCLick={callback}
                >
                    Show
                </button>
            }
            <span id="time_bar"></span>
        </div>
    ) : null;
}
