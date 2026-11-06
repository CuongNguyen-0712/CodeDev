// @piece edit-listings: Listings and pages an edit affects
listings(course.category);
if (changed.includes("category")) {
    listings(changes.category as string);
    paths.add("/courses");
}
if (changed.includes("slug")) {
    paths.add(`/course/${course.slug}`);
    paths.add(`/course/${changes.slug}`);
}
