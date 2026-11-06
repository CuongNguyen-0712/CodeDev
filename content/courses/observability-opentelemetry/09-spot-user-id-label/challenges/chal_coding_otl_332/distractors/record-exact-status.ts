// @piece record-submission: Count the submission and record who sent it
// Bounded labels only: a handful of routes x methods x 5 status classes, whatever the traffic.
this.submissions.add(1, {
    route: req.route,
    method: req.method,
    status_class: String(status),
});
// Per-learner detail is an event, not a label.
if (req.userId !== null) {
    this.analytics.track({
        name: "submission_created",
        userId: req.userId,
        properties: { challengeId: req.challengeId, status },
    });
}
