// @piece pointer-and-order: Escape names in paths and order the changes
const escapeToken = (name: string) => name.replace(/~/g, "~0").replace(/\//g, "~1");

const cmp = (x: string, y: string) => x.localeCompare(y);
const byPathChangeDetail = (x: Change, y: Change) =>
    cmp(x.path, y.path) || cmp(x.change, y.change) || cmp(x.detail ?? "", y.detail ?? "");
