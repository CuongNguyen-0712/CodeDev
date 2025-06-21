'use client'
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

import { useSearchParams } from 'next/navigation';
import { PageError } from '../ui/error';
import { LoadingContent } from '../ui/loading';

const components = {
    'overview': dynamic(() => import('../content/overview'), { ssr: true }),
    'course': dynamic(() => import('../content/course'), { ssr: true }),
    'project': dynamic(() => import('../content/project'), { ssr: true }),
};

export default function Content({ redirect }) {
    const params = useSearchParams();

    const [state, setState] = useState({
        page: null,
        pending: true,
    })

    useEffect(() => {
        setState((prev) => ({
            ...prev,
            pending: true
        }))

        const query = params.get('name') || 'overview';

        setState((prev) => ({
            ...prev,
            page: query,
            pending: false
        }))
    }, [params])

    const Page = components[state.page];

    return state.pending ?
        <LoadingContent />
        :
        Page === undefined ?
            <PageError />
            :
            <Page redirect={redirect} />
}   