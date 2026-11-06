// @piece step-limit: Ask the model again unless the step budget is spent
if (steps > limits.maxSteps) return stop("max_steps");
const raw = model.next(transcript);
steps++;
