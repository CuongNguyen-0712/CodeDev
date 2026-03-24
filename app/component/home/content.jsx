'use client'
import dynamic from 'next/dynamic';

import { useSearchParams } from 'next/navigation';
import { PageError } from '../ui/error';

const components = {
    'overview': dynamic(() => import('../content/overview'), { ssr: true }),
    'learning': dynamic(() => import('../content/course'), { ssr: true }),
    'project': dynamic(() => import('../content/project'), { ssr: true }),
    'social': dynamic(() => import('../content/social'), { ssr: true }),
};


export default function Content({ redirect, alert }) {
    const params = useSearchParams();
    const page = params.get('tab') || 'overview';
    const Page = components[page];

    if (!Page) return <PageError />;

    return <Page
        redirect={redirect}
        alert={alert}
    />;
}
