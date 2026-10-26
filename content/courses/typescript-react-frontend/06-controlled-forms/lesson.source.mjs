// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
export default ({ h2, h3, p, bullets, numbered, code, callout, challenge }) => ({
    _id: "lesson-trf-2-3",
    title: "Controlled forms & validation the types can check",
    slug: { _type: "slug", current: "controlled-forms-typed-validation" },
    description:
        "The instructors' Create course form saved a course with an empty title and a price typed as \"12abc\": the inputs were uncontrolled and only the API checked them, loosely. Learn when an input should be controlled, how to keep a form in one typed state object, how to write validate(values) as a pure function whose result the compiler forces you to check, when to show errors, how to block double submits and how to put server errors back on their fields - and when an uncontrolled form with FormData is the simpler choice.",
    estimatedTime: 25,

    scenario: {
        role: "Frontend developer, CodeDev instructor tools",
        problem:
            "The content team found a draft course in the admin list with no title, priced at 12 VND. The instructor had typed \"12abc\" in the price box by mistake and pressed Enter before filling in the title. The Create course form at https://app.codedev.test/teach/new read its inputs through refs only at submit time and sent them as they were; the API parsed the price with parseFloat (which reads \"12abc\" as 12) and only checked that a title field existed. A first fix attempt added state to the price input and produced a new console warning: \"A component is changing an uncontrolled input to be controlled\".",
    },

    content: [
        h2("1. The incident: a form nobody checked"),
        p("This is the form as it shipped. The inputs keep their own values in the DOM, and the component reads them through refs when the form is submitted:"),
        code("tsx", `
// features/teach/CreateCourseForm.tsx - the version that shipped
export function CreateCourseForm() {
  const titleRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await api.post("/courses", {
      title: titleRef.current?.value,
      price: priceRef.current?.value,      // "12abc" goes out as it is
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <input ref={titleRef} name="title" />
      <input ref={priceRef} name="price" />
      <button>Create course</button>
    </form>
  );
}`, "CreateCourseForm.tsx"),
        p("Nothing in the browser looked at the values before they left, and the API's check was looser than anyone assumed. There was also no way to show an error next to a field while the instructor was typing, because the component did not know what was in the fields until the very end."),

        h2("2. Reproduce it and read the evidence"),
        p("Open the form, leave the title empty, type `12abc` in the price and press Enter. In DevTools, the **Network** tab shows the request and its payload:"),
        code("text", `
POST https://api.codedev.test/courses        201 Created
Request payload   {"title":"","price":"12abc"}
Response          {"id":"crs_8812","title":"","price":12,"status":"draft"}`, "Network tab"),
        p("Two layers let this through. The form sent whatever was typed; the API accepted it and silently changed `\"12abc\"` into `12`. This lesson fixes the form. The API needs its own fix too (a strict check that returns `422` with field errors), because a browser check never protects the server: anyone can send this request with `curl`. The form's job is different: give the instructor fast, precise feedback so a valid request is the only one they can send by accident."),
        p("Then the first fix attempt, in the **Console**:"),
        code("text", `
Warning: A component is changing an uncontrolled input to be controlled. This is likely caused by
the value changing from undefined to a defined value, which should not happen. Decide between using
a controlled or uncontrolled input element for the lifetime of the component.`, "Console"),
        code("tsx", `
const [price, setPrice] = useState<string>();   // undefined on the first render
<input value={price} onChange={(e) => setPrice(e.target.value)} />`, "the first fix attempt"),
        p("On the first render `value` is `undefined`, which React reads as \"no value prop\": an uncontrolled input. After the first keystroke it is a string: controlled. React warns because an input should be one or the other for its whole life. The cure is to never pass `undefined` as a value: start with `useState(\"\")`."),

        h2("3. Core idea: who owns the value"),
        p("An input is **controlled** when React state owns its value: you pass `value` and update the state in `onChange`, so what you render is what the field shows, on every keystroke. It is **uncontrolled** when the DOM owns the value: you may pass `defaultValue` for the first render and read the value later (a ref, or `FormData` on submit)."),
        bullets([
            "**Use controlled inputs** when the UI needs the value while the user types: errors shown as they correct a field, a submit button that depends on the values, fields that depend on each other (a price that is only shown for paid courses), formatting or limiting input, or a live preview of the course card.",
            "**Uncontrolled + FormData is fine** when you only need the values once, on submit: a search box that navigates, a newsletter sign-up, a short form validated on submit only. React 19 supports this well: `<form action={fn}>` passes a `FormData` to `fn`, and `useActionState` and `useFormStatus` give you the result and the pending state. Less state, fewer renders, nothing to keep in sync.",
            "**Do not mix them on one input.** `value` with no `onChange` gives a read-only field (React warns); `value` and `defaultValue` together is an error; a `value` that becomes `undefined` turns a controlled input into an uncontrolled one.",
        ]),
        callout("info", "Validation in the form is for the user, not for security",
            "Every rule the form checks must also be checked by the API, which is the trust boundary. The form's version exists to show the error early, next to the field, in words the user understands. Keep the two in sync by testing both against the same examples."),
        h3("One typed object for the whole form"),
        p("A form is a small piece of state with rules that connect its fields (the same reason the catalog used a reducer in lesson 2.1). Keep the values in **one object** with a type that describes exactly what the inputs hold - strings, because that is what an `<input>` gives you - and a separate type for what the API needs:"),
        code("typescript", `
// features/teach/courseForm.ts
type Category = "react" | "node" | "sql" | "python" | "devops";
type Level = "beginner" | "intermediate" | "advanced";

export type CourseFormValues = {
  title: string;
  category: Category | "";      // "" = nothing chosen yet in the <select>
  level: Level;
  price: string;                // what the user typed, e.g. "149000" or "12abc"
};

export type CreateCourseInput = {
  title: string;
  category: Category;
  level: Level;
  price: number;                // VND, a whole number
};

export type FieldErrors = Partial<Record<keyof CourseFormValues, string>>;

export const initialValues: CourseFormValues = { title: "", category: "", level: "beginner", price: "" };`, "courseForm.ts"),
        p("`FieldErrors` is keyed by `keyof CourseFormValues`. A typo such as `errors.prcie = \"...\"` is a compile error, and renaming a field in the values type flags every place that still uses the old name."),
        h3("validate(values): a pure function the compiler makes you check"),
        p("Write the rules as one pure function from values to a result. Its return type is a discriminated union: either the errors, or an input that has already been converted to what the API needs. `createCourse(input: CreateCourseInput)` cannot be called with the raw form values, so the only way to get a valid input is to validate first:"),
        code("typescript", `
export type Validation =
  | { ok: true; input: CreateCourseInput }
  | { ok: false; errors: FieldErrors };

export function validate(values: CourseFormValues): Validation {
  const errors: FieldErrors = {};
  const title = values.title.trim();
  const category = values.category === "" ? null : values.category;

  if (title === "") errors.title = "Enter a title.";
  else if (title.length > 120) errors.title = "Keep the title under 120 characters.";
  if (category === null) errors.category = "Choose a category.";
  if (!/^\\d{1,9}$/.test(values.price)) errors.price = "Enter the price in VND, digits only (0 for a free course).";

  if (category === null || Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, input: { title, category, level: values.level, price: Number(values.price) } };
}`, "courseForm.ts"),
        p("Note the strictness of the price rule. `Number(\"12abc\")` is `NaN` and `parseFloat(\"12abc\")` is `12`; neither tells you the user made a mistake. A regular expression on the whole string says exactly which strings are accepted, and only then is the string converted."),

        h2("4. Worked example: the form, step by step"),
        code("tsx", `
type Touched = Partial<Record<keyof CourseFormValues, boolean>>;

export function CreateCourseForm({ onCreated }: { onCreated: (id: string) => void }) {
  const [values, setValues] = useState<CourseFormValues>(initialValues);
  const [touched, setTouched] = useState<Touched>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const validation = validate(values);                        // derived, never stored (lesson 2.2)
  const errors = validation.ok ? {} : validation.errors;

  function errorFor(field: keyof CourseFormValues): string | undefined {
    if (serverErrors[field]) return serverErrors[field];
    return touched[field] || submitted ? errors[field] : undefined;
  }

  function update<K extends keyof CourseFormValues>(field: K, value: CourseFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
    setServerErrors((prev) => ({ ...prev, [field]: undefined }));   // the user is fixing it
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;                                      // a second Enter does nothing
    setSubmitted(true);
    if (!validation.ok) return;                               // errors are now shown on every field
    setPending(true);
    setFormError(null);
    const result = await createCourse(validation.input);      // takes CreateCourseInput only
    setPending(false);
    if (result.ok) return onCreated(result.id);
    if (result.status === 422) setServerErrors(toFieldErrors(result.fields));
    else setFormError("The course could not be saved. Try again in a moment.");
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="title">Title</label>
      <input
        id="title"
        value={values.title}
        onChange={(e) => update("title", e.target.value)}
        onBlur={() => setTouched((t) => ({ ...t, title: true }))}
        aria-invalid={errorFor("title") ? true : undefined}
        aria-describedby="title-error"
      />
      <p id="title-error" role="alert">{errorFor("title")}</p>

      {/* category <select>, level <select> and price <input inputMode="numeric"> follow the same pattern */}

      {formError && <p role="alert">{formError}</p>}
      <button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Creating..." : "Create course"}
      </button>
    </form>
  );
}`, "CreateCourseForm.tsx"),
        p("Walk through the decisions:"),
        numbered([
            "**One `values` object, updated through one typed `update` function.** `update(\"price\", 12)` does not compile: `CourseFormValues[\"price\"]` is `string`. Every input has a string `value` from the first render, so none of them can switch between controlled and uncontrolled.",
            "**Errors are derived, not stored.** `validate(values)` runs on each render, so an error disappears the moment the value becomes valid. Only the things the user's actions create are state: which fields they left (`touched`), whether they tried to submit, what the server said.",
            "**Show an error after blur or after submit, not on the first keystroke.** Telling someone \"Enter a title\" while they are typing the first letter is noise. Once a field was left, or the user pressed submit, errors update live as they type a correction.",
            "**Block double submits.** `disabled={pending}` stops the second click and `if (pending) return` stops a second Enter. Without them, an impatient instructor creates the same course twice (the same problem as a retried POST in the HTTP course).",
            "**Put server errors back on their fields.** The API is the authority on rules the browser cannot check, such as \"a course with this title already exists\". A `422` response lists errors by field name; show each next to its input, and clear it when the user edits that field.",
        ]),
        h3("Mapping server errors to fields"),
        p("The server's field names are data from outside your types. Keep only the ones that are fields of this form and show the rest as a form-level message, so a renamed API field cannot silently swallow an error:"),
        code("typescript", `
// 422 body: {"error":"validation_failed","fields":{"title":"A course with this title already exists"}}
function isFormField(name: string): name is keyof CourseFormValues {
  return Object.hasOwn(initialValues, name);
}

export function toFieldErrors(fields: Record<string, string>): FieldErrors {
  const errors: FieldErrors = {};
  for (const [name, message] of Object.entries(fields)) {
    if (isFormField(name)) errors[name] = message;
    else console.warn("Unmapped server error", name, message);   // and show it in formError
  }
  return errors;
}`, "courseForm.ts"),
        callout("tip", "The same form, uncontrolled",
            "If this form only validated on submit, the simpler version would be <form action={createAction}> with plain <input name=\"title\" defaultValue=\"\"> fields. createAction receives a FormData; build CourseFormValues from formData.get(...) (each value is a string or a File, so check), run the same validate(values), and return the errors with useActionState. The validate function and its types do not change - only who owns the values does."),

        challenge("chal_quiz_trf_231"),

        h2("5. How to verify it"),
        bullets([
            "**Unit test `validate`.** It is a pure function. Test the incident first: `validate({ ...initialValues, price: \"12abc\" })` must not be `ok` and must have both `errors.title` and `errors.price`. Then the edges: a title of only spaces, 120 and 121 characters, price `\"0\"`, `\"1e5\"`, `\" 12\"`, `\"-5\"`, `\"12.5\"`.",
            "**Network tab.** Submit the incident's values: no request may leave. Submit valid values and press Enter twice quickly: exactly one `POST /courses`.",
            "**Force a server error.** Create a course with a title that already exists (or use a mock in development) and check that the `422` message appears under the title, and goes away when you edit it.",
            "**Console.** No \"changing an uncontrolled input to be controlled\" or \"provided a `value` prop without an `onChange` handler\" warnings while you use every field.",
            "**Keyboard and screen reader.** Tab through the form: every error is announced (`role=\"alert\"`) and linked to its input with `aria-describedby`; the invalid input has `aria-invalid`.",
            "**`tsc`.** Try to call `createCourse(values)` with the raw form values: it must not compile.",
        ]),

        h2("6. Common mistakes"),
        bullets([
            "**Validating only in the API, or only in the browser.** One gives users late, generic feedback; the other gives the server no protection. Spot it by sending an invalid request with `curl` (server) and by submitting invalid values with the Network tab open (browser).",
            "**`undefined` or `null` as a value.** `useState<string>()`, or `value={course.description}` when the API returns `null` for an empty description. Spot it by the controlled/uncontrolled warning in the console; fix it with `\"\"` defaults, converting `null` to `\"\"` when you load the values.",
            "**Storing errors in state next to the values.** Errors kept in `useState` and updated in handlers drift from the values (an error that stays after the field was fixed). Derive them with `validate(values)`; store only what the user did (touched, submitted) and what the server said.",
            "**Converting with `Number` or `parseFloat` alone.** `parseFloat(\"12abc\")` is `12` and `Number(\"\")` is `0`. Spot it with tests for those exact strings; check the whole string first, then convert.",
            "**A submit button that is never disabled.** Spot it by pressing Enter twice and counting requests in the Network tab.",
        ]),

        h2("7. Summary"),
        bullets([
            "Control an input when the UI needs its value while the user types; use an uncontrolled form with FormData when you only need the values on submit. Never let a value become undefined.",
            "Keep the form in one typed values object, and write validate(values) as a pure function that returns either field errors keyed by the values type or a converted input, so the API call cannot compile without validation.",
            "Derive errors, show them after blur or submit, disable submit while a request is pending, map 422 errors back to their fields, and keep the server's own validation: the form is for feedback, the API is the boundary.",
        ]),

        h2("Sources"),
        bullets([
            "react.dev: <input> reference - controlling an input with a state variable, and the controlled/uncontrolled warnings",
            "react.dev: <form> reference, useActionState and useFormStatus (React 19 form actions)",
            "MDN Web Docs: FormData; ARIA: aria-invalid and aria-describedby",
        ]),
        callout("tip", "Practice on your own (not graded)",
            "Add a \"Free course\" checkbox that hides the price field and makes price \"0\". Decide where that rule lives (validate, the update function, or both), write the tests for validate first, and check in React DevTools that no error state is stored."),
    ],
});
