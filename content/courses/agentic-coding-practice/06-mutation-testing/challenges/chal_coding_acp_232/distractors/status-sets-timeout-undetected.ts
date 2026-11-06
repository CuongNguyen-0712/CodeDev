// @piece status-sets: Statuses that count as detected and undetected
const STATUSES: Status[] = ["killed", "survived", "timeout", "no-coverage", "compile-error", "ignored"];
const DETECTED = new Set(["killed"]);
const UNDETECTED = new Set(["survived", "no-coverage", "timeout"]);
