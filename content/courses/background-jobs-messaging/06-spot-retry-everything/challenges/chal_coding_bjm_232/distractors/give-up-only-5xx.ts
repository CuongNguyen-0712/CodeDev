// @piece give-up: Decide whether to try again
// Could the same request succeed later? Permanent errors fail the job at once.
const permanent = error instanceof HttpError && error.status < 500;
if (attempt === MAX_ATTEMPTS || permanent) break;
