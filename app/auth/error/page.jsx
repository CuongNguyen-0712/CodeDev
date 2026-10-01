import { Suspense } from 'react';

import ErrorPage from '@/components/auth/errorPage';

import { LoadingContent } from "@/components/ui/loading";

import '@/styles/auth/error.css';

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

