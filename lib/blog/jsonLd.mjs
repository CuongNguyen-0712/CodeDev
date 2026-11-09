// `<` becomes the six characters \u003c so a title or excerpt cannot close the script tag.
export function blogPostingJsonLd(post, origin) {
    return JSON.stringify({
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        headline: post.title,
        description: post.excerpt,
        datePublished: new Date(post.publishedAt).toISOString(),
        dateModified: new Date(post.updatedAt || post.publishedAt).toISOString(),
        author: { "@type": "Person", name: post.author.username, url: `${origin}/profile/${post.author.id}` },
        mainEntityOfPage: `${origin}/blog/${post.slug}`,
    }).replace(/</g, "\\u003c");
}
