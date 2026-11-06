// @piece parse-courses: Check every element of the array
if (!Array.isArray(json)) return { ok: false, error: { kind: "invalid-response", reason: "expected an array" } };
const data: Course[] = [];
for (let i = 0; i < json.length; i++) {
    const course = parseCourse(json[i], i);
    if (typeof course === "string") return { ok: false, error: { kind: "invalid-response", reason: course } };
    data.push(json[i] as Course);
}
return { ok: true, data };
