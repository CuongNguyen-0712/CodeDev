import dynamic from 'next/dynamic';

const Study = dynamic(() => import('../content/study/study'), { ssr: false });
const Roadmap = dynamic(() => import('../content/roadmap/Roadmap'), { ssr: false });
const Social = dynamic(() => import('../content/social/Social'), { ssr: false });
const Ranking = dynamic(() => import('../content/ranking/Ranking'), { ssr: false });
const Benefit = dynamic(() => import('../content/benefit/Benefit'), { ssr: false });

export default function Content({ target, isComment }) {

    const contentTitles = [
        <Study />,
        <Roadmap />,
        <Social />,
        <Ranking />,
        <Benefit />
    ];

    return (
        <article className={`content-layout ${isComment ? '' : 'resize'}`}>
            {contentTitles[target - 1]}
        </article>
    )
}