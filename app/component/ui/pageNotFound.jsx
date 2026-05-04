'use client'
import Image from 'next/image'

import { useRouterActions } from '@/app/router/useRouterActions';

import { IoArrowBack, IoHome } from "react-icons/io5";
import { HiOutlineExclamationCircle } from "react-icons/hi2";

export default function NotFound() {
    const { navigateBack, navigateToHome } = useRouterActions();

    return (
        <div className="not-found-page">
            <div className="not-found-content">
                <div className="not-found-illustration">
                    <Image
                        src="/image/static/404.png"
                        alt="404 illustration"
                        width={280}
                        height={280}
                        priority
                    />
                </div>
                <div className="not-found-text">
                    <span className="error-badge">
                        <HiOutlineExclamationCircle />
                        404 Error
                    </span>
                    <h1>Page not found</h1>
                    <p>Sorry, the page you're looking for doesn't exist or has been moved.</p>
                </div>
                <div className="not-found-actions">
                    <button className="btn-back" onClick={navigateBack}>
                        <IoArrowBack />
                        <span>Go Back</span>
                    </button>
                    <button className="btn-home" onClick={navigateToHome}>
                        <IoHome />
                        <span>Take me home</span>
                    </button>
                </div>
            </div>
        </div>
    );
}