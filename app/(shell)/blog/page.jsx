import Blog from "@/components/blog/blog"

export const metadata = {
    title: "Blog | CodeDev",
    description: "Articles about programming, learning to code and updates to CodeDev.",
};

export default function Page() {
    return (
        <Blog />
    );
}