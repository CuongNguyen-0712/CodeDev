import { getPrerenderedCourseIds, getSitemapPosts } from "@/lib/cachedData";
import { siteOrigin } from "@/lib/siteUrl";

const safe = (label, read) => read().catch((error) => {
    console.error(`[sitemap] ${label} read failed`, error?.message);
    return [];
});

export default async function sitemap() {
    const origin = siteOrigin();
    const statics = ["/", "/course", "/roadmap", "/about", "/blog", "/help"].map((path) => ({ url: `${origin}${path}` }));
    const [posts, courseIds] = await Promise.all([safe("posts", getSitemapPosts), safe("courses", getPrerenderedCourseIds)]);
    return [
        ...statics,
        ...posts.map((p) => ({ url: `${origin}/blog/${p.slug}`, lastModified: p.updatedAt })),
        ...courseIds.map((id) => ({ url: `${origin}/course/${id}` })),
    ];
}
