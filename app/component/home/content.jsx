import dynamic from 'next/dynamic';

const components = {
    0: dynamic(() => import('../content/dashboard/dashboard'), { ssr: true }),
    1: dynamic(() => import('../content/course/course'), { ssr: true }),
    2: dynamic(() => import('../content/roadmap/roadmap'), { ssr: true }),
};

const DefaultComponent = components[1]; 
export default function Content({ target }) {
    const SelectedComponent = components[target] || DefaultComponent;
    
    return (
        <article className='content-layout'>
            <SelectedComponent />
        </article>
    )
}