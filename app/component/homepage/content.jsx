'use client'
import { useSearchParams } from 'next/navigation';

import { useApp } from '@/app/contexts/appContext';

import { PageError } from '../ui/error';

const components = {
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
