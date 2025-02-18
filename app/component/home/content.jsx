import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';

const components = {
    0: dynamic(() => import('../content/overview/overview'), { ssr: true }),
    1: dynamic(() => import('../content/course/course'), { ssr: true }),
    2: dynamic(() => import('../content/roadmap/roadmap'), { ssr: true }),
};

const DefaultComponent = components[1];
export default function Content() {
    const params = useSearchParams();
    const query = params.get('target');
    const SelectedComponent = components[query] || DefaultComponent;

    return (
        <article className='content-layout'>
            <SelectedComponent />
        </article>
    )
}   