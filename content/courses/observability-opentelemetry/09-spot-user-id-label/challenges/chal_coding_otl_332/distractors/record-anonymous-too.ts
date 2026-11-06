// @piece record-submission: Count the submission and record who sent it
// Bounded labels only: a handful of routes x methods x 5 status classes, whatever the traffic.
this.submissions.add(1, {
    route: req.route,
    method: req.method,
    status_class: `${Math.floor(status / 100)}xx`,
});
// Per-learner detail is an event, not a label.
this.analytics.track({
    name: "submission_created",
    userId: req.userId ?? "anonymous",
    properties: { challengeId: req.challengeId, status },
});
