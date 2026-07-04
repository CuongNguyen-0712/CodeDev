'use client'
import Image from 'next/image'

import { useRouterActions } from '@/app/router/useRouterActions';

import { HiOutlineExclamationCircle } from "react-icons/hi2";
import { FaChevronLeft } from "react-icons/fa";

export default function NotFound() {
    const { navigateBack } = useRouterActions();

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
                <button className="btn-back" onClick={() => navigateBack()}>
                    <FaChevronLeft />
                    <span>Go back</span>
                </button>
            </div>
        </div >
    );
}   
