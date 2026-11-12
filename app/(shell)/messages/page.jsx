import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/shadcn/empty";

import { LuMessageSquare } from "react-icons/lu";

export async function generateMetadata() {
    return {
        title: 'Messages | CodeDev',
        description: 'Your conversations on CodeDev',
    };
}

// Right pane when no conversation is open; the layout hides it below 768px.
export default function Page() {
    return (
        <Empty className="h-full border border-dashed">
            <EmptyHeader>
                <EmptyMedia variant="icon"><LuMessageSquare aria-hidden="true" /></EmptyMedia>
                <EmptyTitle>Select a conversation</EmptyTitle>
                <EmptyDescription>Choose a conversation from the list to read and reply.</EmptyDescription>
            </EmptyHeader>
        </Empty>
    );
}
