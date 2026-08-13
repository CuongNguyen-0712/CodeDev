'use client';
import { Suspense } from 'react';

import { useSearchParams } from 'next/navigation';

import ErrorPage from '@/app/component/auth/errorPage';

import { LoadingContent } from "@/app/component/ui/loading";

import '@/app/style/auth/error.css';

export default function AuthErrorPage() {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return (
    <Suspense fallback={<LoadingContent />}>
      <ErrorPage error={error} />
    </Suspense>
  );
};

