import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const components = {
    0: dynamic(() => import('../content/overview/overview'), { ssr: true }),
    1: dynamic(() => import('../content/course/course'), { ssr: true }),
    2: dynamic(() => import('../content/project/project'), { ssr: true }),
};

export default function Content({ redirect }) {
    const params = useSearchParams();
    const query = params.get('target') || 0;
    const SelectedComponent = components[query];

    return (
        <SelectedComponent redirect={redirect} />
    )
}   