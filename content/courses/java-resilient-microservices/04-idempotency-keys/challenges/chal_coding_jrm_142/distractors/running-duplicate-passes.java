// @piece still-running: Answer a duplicate that arrives while the first runs
if (kept.status() == IN_PROGRESS) {
    return Decision.PROCESS;
}
