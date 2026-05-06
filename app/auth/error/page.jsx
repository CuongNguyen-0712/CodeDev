'use client';

import {Suspense} from 'react';
import { useSearchParams } from 'next/navigation';
import AuthError from '@/app/component/auth/error';
import { LoadingContent } from "@/app/component/ui/loading";

const ErrorContent = () => {
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  return <AuthError error={error} />;
};

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingContent />}>
      <ErrorContent />
    </Suspense>
  );
};

