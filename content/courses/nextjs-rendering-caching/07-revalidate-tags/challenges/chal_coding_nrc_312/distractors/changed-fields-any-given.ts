// @piece changed-fields: Keep only the fields whose value changes
const changes: CourseChanges = event.type === "price_changed" ? { price: event.price } : event.changes ?? {};
const changed = COURSE_FIELDS.filter((f) => changes[f] !== undefined);
