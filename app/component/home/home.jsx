import Content from './content';

import BaseLayout from '@/app/layout/baseLayout';

export default function Home() {
    return (
        <BaseLayout
            children={
                <Content />
            }>
        </BaseLayout>
    );
} 