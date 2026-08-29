import { Suspense } from 'react';

import ErrorPage from '@/app/component/auth/errorPage';

import { LoadingContent } from "@/app/component/ui/loading";

import '@/app/style/auth/error.css';

export async function generateMetadata() {
  return {
    title: "Authentication Error",
    description: "An error occurred during the authentication process.",
  };
}

export default function AuthErrorPage() {
  return (
    <Suspense fallback={<LoadingContent />}>
      <ErrorPage />
    </Suspense>
  );
};

