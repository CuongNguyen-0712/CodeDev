import { useState, useEffect, useCallback } from "react";

import { IoWarning, IoCloseCircle, IoCheckmarkCircle, IoInformationCircle, IoClose } from "react-icons/io5";

const alertConfig = {
    0: { icon: IoInformationCircle, color: 'var(--color_primary)', bg: 'rgba(48, 102, 190, 0.1)', label: 'Info' },
    200: { icon: IoCheckmarkCircle, color: 'var(--color_green)', bg: 'rgba(16, 185, 129, 0.1)', label: 'Success' },
    500: { icon: IoCloseCircle, color: 'var(--color_red)', bg: 'rgba(244, 63, 94, 0.1)', label: 'Error' },
    default: { icon: IoWarning, color: 'var(--color_orange)', bg: 'rgba(249, 115, 22, 0.1)', label: 'Warning' }
};

export default function AlertPush({ status = 0, message = '', callback = null, reset }) {
    const [stack, setStack] = useState([]);

    const pushAlert = useCallback((status, message, callback) => {
        const id = Date.now();
        setStack((prev) => [...prev, { id, status, message, callback }]);
    }, []);

    useEffect(() => {
        if (!message || message.trim() === '') return;
        pushAlert(status, message, callback);
        reset();
    }, [message, status, callback, pushAlert]);

    const removeAlert = useCallback((id) => {
        setStack((prev) => prev.filter((a) => a.id !== id));
    }, []);

    return stack.length > 0 && (
        <section className="alert-stack">
            {stack.map((item) => (
                <AlertItem key={item.id} {...item} onRemove={removeAlert} />
            ))}
        </section>
    );
}

function AlertItem({ id, status, message, callback, onRemove }) {
    const config = alertConfig[status] || alertConfig.default;
    const Icon = config.icon;

    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(id);
        }, 3000);

        return () => clearTimeout(timer);
    }, [id, onRemove]);

    const handleCallback = () => {
        if (typeof callback === 'function') callback();
    };

    return (
        <div className="alert-item" style={{ '--alert-color': config.color, '--alert-bg': config.bg }}>
            <div className="alert-icon">
                <Icon />
            </div>
            <div className="alert-content">
                <span className="alert-label">{config.label}</span>
                <p className="alert-message">{message}</p>
            </div>
            <div className="alert-actions">
                {callback && (
                    <button className="btn-action" onClick={handleCallback}>
                        Next
                    </button>
                )}
                <button className="btn-close" onClick={() => onRemove(id)}>
                    <IoClose />
                </button>
            </div>
            <span className="alert-progress" />
        </div>
    );
}
