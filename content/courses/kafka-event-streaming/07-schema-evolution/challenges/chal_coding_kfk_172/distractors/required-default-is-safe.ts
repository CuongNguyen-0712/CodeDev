// @piece required-fields: Fields the reader cannot do without
for (const field of reader.schema.required ?? []) {
    const hasDefault = reader.schema.properties[field]?.default !== undefined;
    if (!guaranteed.has(field) && !hasDefault) problems.push(`${where}: "${field}" is required but may be missing`);
}
