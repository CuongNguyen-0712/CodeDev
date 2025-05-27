export default function PostFeedbackService(data) {
    return fetch('/api/post/postFeedback', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
}