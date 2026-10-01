'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { LuArrowLeft, LuRefreshCw, LuHouse, LuTriangleAlert } from 'react-icons/lu';

export default function ErrorPage() {
    const errorMessages = {
        Configuration: {
            title: "Server Configuration Error",
            desc: "There is a temporary issue with our authentication provider configuration. Our team has been notified.",
            tip: "Please try logging in again in a few moments."
        },
        AccessDenied: {
            title: "Access Denied",
            desc: "You do not have the required permissions or your sign-in attempt was rejected by the provider.",
            tip: "Ensure your OAuth account has granted access to CodeDev."
        },
        Verification: {
            title: "Verification Expired",
            desc: "The magic link or authentication token has expired or has already been used.",
            tip: "Request a fresh verification link to continue."
        },
        Callback: {
            title: "OAuth Callback Error",
            desc: "We encountered an error while communicating with the third-party authentication service.",
            tip: "Check your internet connection and try again."
        },
        SessionInvalid: {
            title: "Session Invalid",
            desc: "Your session token could not be verified or is corrupt.",
            tip: "Sign in again to establish a secure session."
        },
        SessionRevoked: {
            title: "Session Terminated",
            desc: "Your active session was revoked or signed out from another device.",
            tip: "Enter your credentials to sign in."
        },
        SessionExpired: {
            title: "Session Expired",
            desc: "Your login session has timed out due to inactivity.",
            tip: "Sign in again to continue where you left off."
        },
        Default: {
            title: "Authentication Failed",
            desc: "An unexpected error occurred during the sign-in or registration process.",
            tip: "Try signing in again or contact our support team."
        }
    };

    const searchParams = useSearchParams();
    const error = searchParams.get('error');

    const errorDetails = errorMessages[error] || errorMessages.Default;

    return (
        <div className="auth_error_container">
            <div className="auth_error_card">
                <div className="error_illustration">
                    <div className="error_glow_bg" />
                    <Image
                        src="/image/static/auth_failed.png"
                        alt="Authentication Failed"
                        width={96}
                        height={96}
                        priority
                        unoptimized
                    />
                    <span className="error_icon_badge">
                        <LuTriangleAlert fontSize={16} />
                    </span>
                </div>

                <div className="error_text_group">
                    <h1>{errorDetails.title}</h1>
                    <p className="error_desc">{errorDetails.desc}</p>
                    <p className="error_tip">💡 {errorDetails.tip}</p>
                </div>

                {error && (
                    <div className="error_metadata">
                        <span className="metadata_label">Code:</span>
                        <code>{error}</code>
                    </div>
                )}

                <div className="error_actions">
                    <Link href="/auth" className="btn_redirect_primary">
                        <LuRefreshCw fontSize={16} />
                        <span>Try Signing In Again</span>
                    </Link>

                    <Link href="/" className="btn_redirect_secondary">
                        <LuHouse fontSize={16} />
                        <span>Back to Home</span>
                    </Link>
                </div>
            </div>
        </div>
    );
}

