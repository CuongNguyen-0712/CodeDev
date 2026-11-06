// @piece collect-jobs: Read the lines into one record per job
for (const line of lines) {
    const e = parseLine(line);
    if (!e) {
        skippedLines++;
        continue;
    }
    queues.add(e.queue);
    first = Math.min(first, e.at);
    last = Math.max(last, e.at);
    const key = `${e.queue}\u0000${e.jobId}`;
    const job = jobs.get(key) ?? { queue: e.queue };
    const seen = job[e.type];
    job[e.type] = e.at; // keep what the log says last
    jobs.set(key, job);
}
