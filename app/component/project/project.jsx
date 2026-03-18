import BaseLayout from "@/app/layout/baseLayout";
import ProjectContent from "./content";

export default function Project() {
    return (
        <BaseLayout children={<ProjectContent />}>
        </BaseLayout>
    )
}