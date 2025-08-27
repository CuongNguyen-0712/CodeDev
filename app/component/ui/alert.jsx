import { useState, useEffect } from "react";

import { IoWarning, IoCloseCircle, IoCheckmarkCircle, IoInformationCircle } from "react-icons/io5";

export default function AlertPush({ status = 0, message = '', reset }) {
    const [visible, setVisible] = useState(true);

    const style = {
        0: { background: 'var(--color_gray_light)', color: 'var(--color_white)' },
        200: { background: 'var(--color_green)', color: 'var(--color_white)' },
        500: { background: 'var(--color_red)', color: 'var(--color_white)' },
    }

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
            style={{ ...style[status] || { background: 'var(--color_yellow)', color: 'var(--color_white)' } }}
        >
            {
                ({
                    0: <IoInformationCircle fontSize={16} />,
                    200: <IoCheckmarkCircle fontSize={16} />,
                    500: <IoCloseCircle fontSize={16} />,
                }[status] || <IoWarning fontSize={16} />)
            }
            <p>{message}</p>
            <span id='time_bar' style={{ background: style[status] ? style[status].color : 'var(--color_white)' }}></span>
        </div>
    ) : null;
}
