'use client';

import Image from "next/image";
import Link from "next/link";
import { useRouterActions } from "@/router/useRouterActions";

import { IoReload, IoClose, IoArrowBack, IoHomeOutline } from "react-icons/io5";
import { HiExclamationTriangle } from "react-icons/hi2";

export function ErrorReload({
    data = null,
    refetch,
    callback = null,
    compact = false,
    title = null
}) {
    if (data === null || data === undefined) return null;

    const status = typeof data === 'object'
        ? (data?.status || data?.statusCode || data?.response?.status || 500)
        : 500;

    const message = typeof data === 'string'
        ? data
        : (data?.message || data?.error || "An unexpected error occurred. Please try again.");

    const heading = title || (
        status === 404
            ? "Resource Not Found"
            : status === 401 || status === 403
            ? "Access Denied"
            : "Unable to Load Data"
    );

    return (
        <div className={`error-container ${compact ? 'compact' : ''}`} role="alert">
            <div className="error-content">
                <div className="error-icon-wrap">
                    <div className="error-icon">
                        <HiExclamationTriangle />
                    </div>
                </div>

                <div className="error-text">
                    <h4>{heading}</h4>
                    <p>{message}</p>
                    {status && (
                        <span className="error-code">
                            HTTP {status}
                        </span>
                    )}
                </div>

                <div className="error-actions">
                    {refetch && (
                        <button
                            type="button"
                            className="btn-reload"
                            onClick={() => refetch()}
                            title="Retry loading data"
                        >
                            <IoReload className="reload-icon" />
                            <span>Try Again</span>
                        </button>
                    )}
                    {callback && (
                        <button
                            type="button"
                            className="btn-dismiss"
                            onClick={callback}
                            title="Dismiss error"
                            aria-label="Dismiss"
                        >
                            <IoClose />
                            <span>Dismiss</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

export function PageError({
    title = "Something went wrong",
    message = null
}) {
    const { navigateBack } = useRouterActions();

    return (
        <div className="page-error" role="alert">
            <div className="error-content">
                <div className="error-illustration">
                    <Image
                        src="/image/static/broken_link.png"
                        alt="Broken link illustration"
                        width={130}
                        height={130}
                        priority
                    />
                </div>
                <div className="error-text">
                    <h2>{title}</h2>
                    <p>
                        {message || "The page you're looking for was moved, removed, or is temporarily unavailable."}
                    </p>
                </div>
                <div className="error-actions">
                    <button
                        type="button"
                        className="btn-back"
                        onClick={() => navigateBack()}
                    >
                        <IoArrowBack />
                        <span>Go Back</span>
                    </button>
                    <Link href="/" className="btn-home">
                        <IoHomeOutline />
                        <span>Back to Home</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}
