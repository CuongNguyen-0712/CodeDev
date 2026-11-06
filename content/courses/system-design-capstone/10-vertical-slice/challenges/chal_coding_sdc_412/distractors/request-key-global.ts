// @piece request-key: The idempotency key of this request
const { requestId, userId, lessonId } = req;
const key = requestId;
