// @piece compare-code: Turn code into comparable n-grams
// Collapse whitespace so a re-indented copy of the solution is caught too.
function flatten(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}
