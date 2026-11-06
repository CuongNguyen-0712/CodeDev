// @piece list: The user's lessons, most recent bookmark first
return [...(this.byUser.get(userId) ?? [])]
    .sort((a, b) => b.at - a.at)
    .map((b) => b.lessonId);
