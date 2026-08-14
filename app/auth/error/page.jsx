'use client';
import { Suspense } from 'react';

import ErrorPage from '@/app/component/auth/errorPage';

import { LoadingContent } from "@/app/component/ui/loading";

import '@/app/style/auth/error.css';

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingContent />}>
      <ErrorPage />
    </Suspense>
  );
};

