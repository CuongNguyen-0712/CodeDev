'use client'

import { useRouterActions } from '@/app/router/useRouterActions';
import { HiOutlineShieldExclamation } from "react-icons/hi2";
import { FaLock, FaChevronLeft, FaHome } from "react-icons/fa";

export default function Forbidden() {
    const { navigateBack, navigate } = useRouterActions();

    return (
        <div className="forbidden-page">
            <div className="forbidden-content">
                <div className="forbidden-illustration">
                    <div className="forbidden-shield-glow">
                        <FaLock className="shield-icon" />
                    </div>
                </div>

                <div className="forbidden-text">
                    <span className="forbidden-badge">
                        <HiOutlineShieldExclamation />
                        403 Access Denied
                    </span>
                    <h1>Access Forbidden</h1>
                    <p>
                        You don't have the required permissions to view this resource.
                        Please check your account credentials or contact your administrator.
                    </p>
                </div>

                <div className="forbidden-actions">
                    <button type="button" className="btn-back" onClick={() => navigateBack()}>
                        <FaChevronLeft fontSize={16} />
                        <span>Go Back</span>
                    </button>
                    <button type="button" className="btn-home" onClick={() => navigate({ path: '/home' })}>
                        <FaHome fontSize={16} />
                        <span>Return Home</span>
                    </button>
                </div>
            </div>
        </div>
    );
}