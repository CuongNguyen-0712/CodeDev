import { pick } from "./util.js";

export default function (client, ctx) {
    const id = pick(ctx.courseIds);
    client.get("/", "/");
    client.think();
    client.get("/course", "/course");
    client.get("/api/course/courses?limit=20", "/api/course/courses");
    client.get("/api/course/filters", "/api/course/filters");
    client.think();
    if (id) {
        client.get(`/course/${id}`, "/course/:id");
        client.get(`/api/course/course-details?courseId=${id}`, "/api/course/course-details");
        client.get(`/api/course/rating?courseId=${id}`, "/api/course/rating");
        client.get(`/api/course/comments?courseId=${id}`, "/api/course/comments");
        client.think();
    }
    client.get("/roadmap", "/roadmap");
    client.get("/api/roadmap/list", "/api/roadmap/list");
}
