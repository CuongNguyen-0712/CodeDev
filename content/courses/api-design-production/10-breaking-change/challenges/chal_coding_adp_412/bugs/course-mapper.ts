// @piece course-mapper: Map a course row to the response
return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    averageRating: row.ratingAvg,
    ratingCount: row.ratingCount,
    teacher: { id: row.instructorId, name: row.instructorName },
    price: String(row.priceVnd),
};
