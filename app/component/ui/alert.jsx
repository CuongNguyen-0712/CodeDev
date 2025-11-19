import { useState, useEffect, useCallback } from "react";

import { IoWarning, IoCloseCircle, IoCheckmarkCircle, IoInformationCircle } from "react-icons/io5";

export default function AlertPush({ status = 0, message = '', callback = null }) {
    const [stack, setStack] = useState([]);

    const pushAlert = useCallback((status, message, callback) => {
        const id = Date.now();
        setStack((prev) => [...prev, { id, status, message, callback }]);
    }, []);

    useEffect(() => {
        if (!message || message.trim() === '') return;
        pushAlert(status, message, callback);
    }, [message, status, callback, pushAlert]);

    const removeAlert = useCallback((id) => {
        setStack((prev) => prev.filter((a) => a.id !== id));
    }, []);

    return stack.length > 0 && (
        <section id='alert_container'>
            {
                stack.map((item) => (
                    <AlertItem key={item.id} {...item} onRemove={removeAlert} />
                ))
            }
        </section>
    )
}

function AlertItem({ id, status, message, callback, onRemove }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(id);
        }, 2000);

        return () => clearTimeout(timer);
    }, [id]);

    const handleCallback = () => {
        if (typeof (callback) === 'function') callback();
    }

    return (
        <div
            className="alert"
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
                    type="button"
                    onClick={handleCallback}
                >
                    Next
                </button>
            }
            <span id="time_bar"></span>
        </div>
    )
}
