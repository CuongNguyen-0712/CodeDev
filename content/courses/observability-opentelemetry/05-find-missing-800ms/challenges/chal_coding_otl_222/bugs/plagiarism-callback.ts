// @piece plagiarism-callback: Call the plagiarism client and record its span
plagiarismClient.check(submissionId, (verdict: string) => {
    // the client has no instrumentation: record its call as a span now that we know how long it took
    const span = tracer.startSpan("plagiarism.check", { startTime });
    span.setAttribute("submission.id", submissionId);
    span.setAttribute("plagiarism.verdict", verdict);
    span.end();
    resolve(verdict);
});
