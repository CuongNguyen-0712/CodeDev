// @piece course-mapper: Map a course row to the response
return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    rating: row.ratingAvg,
    averageRating: row.ratingAvg,
    ratingCount: row.ratingCount,
    instructor: { id: row.instructorId, name: row.instructorName },
    teacher: { id: row.instructorId, name: row.instructorName },
    price: String(row.priceVnd) as unknown as number,
    priceAmount: String(row.priceVnd),
};
