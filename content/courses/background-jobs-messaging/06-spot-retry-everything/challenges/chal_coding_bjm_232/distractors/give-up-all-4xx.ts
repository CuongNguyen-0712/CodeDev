// @piece give-up: Decide whether to try again
// Could the same request succeed later? Permanent errors fail the job at once.
const permanent = error instanceof ValidationError
    || (error instanceof HttpError && error.status < 500)
    || (error as SystemError).code === "ENOENT";
if (attempt === MAX_ATTEMPTS || permanent) break;
