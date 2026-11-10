export const BLOG_PUBLISH_EXP_RULE = "blog.post_published";

export const BLOG_LIKE_MILESTONES = [
    { likes: 10, points: 10 },
    { likes: 50, points: 30 },
    { likes: 100, points: 60 },
];

/** The milestone reached by exactly `likeCount` likes, else null. */
export function milestoneAt(likeCount) {
    return BLOG_LIKE_MILESTONES.find((m) => m.likes === likeCount) ?? null;
}
