'use client'
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const components = {
    'overview': dynamic(() => import('../content/overview/overview'), { ssr: true }),
    'course': dynamic(() => import('../content/course/course'), { ssr: true }),
    'project': dynamic(() => import('../content/project/project'), { ssr: true }),
};

const DefaultCompponent = components['overview'];

export default function Content({ redirect }) {
    const params = useSearchParams();
    const query = params.get('name') || 'overview';
    const SelectedComponent = components[query];

    return (
        SelectedComponent ?
            <SelectedComponent redirect={redirect} />
            :
            <DefaultCompponent redirect={redirect} />
    )
}   