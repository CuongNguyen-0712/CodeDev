// @piece result: Return every error or the typed answer
// the type checks repeat here only to narrow the types for the compiler
if (errors.length > 0 || typeof hint !== "string" || (level !== 1 && level !== 2 && level !== 3)
    || typeof revealsSolution !== "boolean") {
    return { ok: false, errors: errors.slice(0, 1) };
}
return { ok: true, value: { hint, level, references, revealsSolution } };
