// @piece record-submission: Count the submission and record who sent it
this.submissions.add(1, {
    user_id: req.userId ?? "anonymous",
    url: req.url,
    method: req.method,
    status: String(status),
});
