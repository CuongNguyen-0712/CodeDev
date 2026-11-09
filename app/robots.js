import { siteOrigin } from "@/lib/siteUrl";

export default function robots() {
    return {
        rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/studio", "/api", "/learning", "/settings", "/blog/new$", "/blog/me$", "/blog/edit/"] },
        sitemap: `${siteOrigin()}/sitemap.xml`,
    };
}
