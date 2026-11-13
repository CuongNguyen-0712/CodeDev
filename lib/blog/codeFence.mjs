// What a Markdown code fence says about its block: the language and an optional file name.
//   ```js app.js            language js, file app.js
//   ```js title="app.js"    the same, in the title= form
//   ```app.py               a file name alone: the language is its extension (py)
// Anything else keeps the old behaviour: CodeBlock shows main.<extension>.

const MAX_FILENAME = 80;
// A dot followed by a short extension: "app.js", "Dockerfile.dev", not "c++" or "1.0".
const LOOKS_LIKE_FILE = /^[\w-][\w.-]*\.[A-Za-z][\w-]{0,9}$/;

const clean = (name) => {
    const value = String(name || "").trim();
    return value && value.length <= MAX_FILENAME ? value : null;
};

/** `className` is react-markdown's "language-xxx"; `meta` is the text after the language on the fence line. */
export function parseCodeFence(className, meta) {
    let language = /language-([^\s]+)/.exec(className || "")?.[1] ?? null;
    const info = String(meta || "").trim();
    const titled = /\btitle=(?:"([^"]*)"|'([^']*)'|(\S+))/.exec(info);
    let filename = clean(titled ? (titled[1] ?? titled[2] ?? titled[3]) : info.split(/\s+/)[0]);

    if (!filename && language && LOOKS_LIKE_FILE.test(language)) {
        filename = clean(language);
        language = language.slice(language.lastIndexOf(".") + 1).toLowerCase();
    }
    return { language, filename };
}
