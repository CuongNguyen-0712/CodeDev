import { blogService } from "@/services/blog.service";
import { getPrerenderedCourseIds } from "@/lib/cachedData";
import { siteOrigin } from "@/lib/siteUrl";

export default async function sitemap() {
    const origin = siteOrigin();
    const statics = ["/", "/course", "/roadmap", "/about", "/blog", "/help"].map((path) => ({ url: `${origin}${path}` }));
    const [posts, courseIds] = await Promise.all([
        blogService.listSitemap().catch(() => []),
        getPrerenderedCourseIds().catch(() => []),
    ]);
    return [
        ...statics,
        ...posts.map((p) => ({ url: `${origin}/blog/${p.slug}`, lastModified: p.updatedAt })),
        ...courseIds.map((id) => ({ url: `${origin}/course/${id}` })),
    ];
}
