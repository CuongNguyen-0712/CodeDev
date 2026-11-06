// @piece insert-value: Insert the value or report a missing variable
const name = match[1];
used.add(name);
const value = Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : undefined;
if (!value) { if (!reported.has(name)) { reported.add(name); errors.push(`missing variable: ${name}`); } }
else if (typeof value === "string") out += value;
else if (typeof value === "number") out += String(value);
else if (!reported.has(name)) {
    reported.add(name);
    errors.push(`missing variable: ${name}`);
}
