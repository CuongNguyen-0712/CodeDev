/*
 * Dracula syntax theme for react-syntax-highlighter (Prism build).
 * Every colour is a --syntax-* token from app/globals.css, so the coding
 * editor, the submission history preview and lesson code blocks stay in step.
 */
const color = (name) => ({ color: `var(--syntax-${name})` });

const base = {
    color: "var(--syntax-foreground)",
    background: "none",
    fontFamily: "inherit",
    fontSize: "inherit",
    lineHeight: "inherit",
    textAlign: "left",
    whiteSpace: "pre",
    wordSpacing: "normal",
    wordBreak: "normal",
    overflowWrap: "normal",
    tabSize: 4,
    hyphens: "none",
};

export const syntaxTheme = {
    'code[class*="language-"]': base,
    'pre[class*="language-"]': { ...base, margin: 0, padding: 0, overflow: "visible" },

    comment: { ...color("comment"), fontStyle: "italic" },
    prolog: color("comment"),
    doctype: color("comment"),
    cdata: color("comment"),

    punctuation: color("punctuation"),
    "template-punctuation": color("string"),
    "interpolation-punctuation": color("keyword"),

    keyword: color("keyword"),
    operator: color("keyword"),
    arrow: color("keyword"),
    tag: color("keyword"),
    atrule: color("keyword"),

    string: color("string"),
    char: color("string"),
    "template-string": color("string"),
    "attr-value": color("string"),
    url: color("string"),

    function: color("function"),
    "function-variable": color("function"),
    method: color("function"),
    "attr-name": color("function"),
    decorator: color("function"),
    annotation: color("function"),
    inserted: color("function"),

    "class-name": { ...color("type"), fontStyle: "italic" },
    "known-class-name": { ...color("type"), fontStyle: "italic" },
    builtin: { ...color("type"), fontStyle: "italic" },
    selector: color("type"),

    number: color("number"),
    boolean: color("number"),
    constant: color("number"),
    symbol: color("number"),

    parameter: { ...color("parameter"), fontStyle: "italic" },
    important: { ...color("parameter"), fontWeight: "bold" },
    entity: color("parameter"),

    property: color("foreground"),
    "property-access": color("foreground"),
    "literal-property": color("foreground"),
    variable: color("foreground"),

    regex: color("regex"),
    deleted: color("regex"),

    bold: { fontWeight: "bold" },
    italic: { fontStyle: "italic" },
};
