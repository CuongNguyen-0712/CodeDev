export default function PostRegisterCourseService() {
    return fetch('/api/post/registerCourse', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        }
    })
}