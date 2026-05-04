'use client'
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

import { useApp } from '@/app/contexts/appContext';

import { PageError } from '../ui/error';

const components = {
    'overview': dynamic(() => import('../content/overview'), { ssr: true }),
    'learning': dynamic(() => import('../content/course'), { ssr: true }),
    'project': dynamic(() => import('../content/project'), { ssr: true }),
    'social': dynamic(() => import('../content/social'), { ssr: true }),
};


export default function Content() {
    const { showAlert, setRedirect } = useApp();
    const params = useSearchParams();
    const page = params.get('tab') || 'overview';
    const Page = components[page];

    if (!Page) return <PageError />;

    return <Page
        redirect={setRedirect}
        alert={showAlert}
    />;
}
