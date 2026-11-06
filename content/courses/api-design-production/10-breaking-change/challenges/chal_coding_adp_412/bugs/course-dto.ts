// @piece course-dto: The fields a course response carries
type CourseDto = {
    id: string;
    slug: string;
    title: string;
    averageRating: number | null;
    ratingCount: number;
    teacher: Person;
    price: string;
};
