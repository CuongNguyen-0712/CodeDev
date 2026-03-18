import BaseLayout from '@/app/layout/baseLayout';
import Content from './content';

export default function HomePage() {
    return (
        <BaseLayout children={
            <Content />
        }>
        </BaseLayout>
    )
} 