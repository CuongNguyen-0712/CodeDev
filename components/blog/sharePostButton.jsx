"use client";

import { Button } from "@/components/shadcn/button";
import { useApp } from "@/contexts/appContext";

import { LuShare2 } from "react-icons/lu";

// Copies the post's URL, as CopyCourseLink does for courses (components/course/params/courseIslands.jsx).
export default function SharePostButton({ slug, className }) {
    const { showAlert: alert } = useApp();
    const share = async () => {
        const url = `${window.location.origin}/blog/${slug}`;
        try {
            await navigator.clipboard.writeText(url);
            alert(200, "Post link copied");
        } catch {
            alert(0, "Copy this link: " + url);
        }
    };

    return (
        <Button variant="ghost" className={className} onClick={share}>
            <LuShare2 aria-hidden="true" />
            Share
        </Button>
    );
}
