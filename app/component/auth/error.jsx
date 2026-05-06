'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { LuArrowLeft } from 'react-icons/lu';

export default function AuthError({ error = "Configuration" }) {

  const errorMessages = {
    Configuration: "A server configuration error has occurred. Please try again later.",
    AccessDenied: "You do not have permission to access this page.",
    Verification: "The authentication link has expired or has already been used.",
    Default: "An unknown error occurred during the authentication process."
  };

  const message = errorMessages[error] || errorMessages.Default;

  return (
    <div className="auth_error_container">
      <div className="auth_error_card">
        <div className="error_illustration">
          <Image
            src="/image/static/auth_failed.png"
            alt="Authentication Failed"
            width={100}
            height={100}
            priority
            unoptimized
          />
        </div>

        <h1>Authentication Failed</h1>
        <p>{message}</p>

        <Link href="/auth" className="btn_redirect">
          <LuArrowLeft />
          Back to Login
        </Link>

        {error && (
          <div className="error_metadata">
            Error Code: {error}
          </div>
        )}
      </div>
    </div>
  );
};
