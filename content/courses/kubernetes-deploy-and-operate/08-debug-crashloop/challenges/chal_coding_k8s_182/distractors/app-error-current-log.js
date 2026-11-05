// @piece app-error-evidence: Why the app exited: the log of the run that died
const line = lastLine(logs.current);
return { cause: "AppError", evidence: line || `exit code ${last ? last.exitCode : "unknown"}`, next: NEXT.AppError };
