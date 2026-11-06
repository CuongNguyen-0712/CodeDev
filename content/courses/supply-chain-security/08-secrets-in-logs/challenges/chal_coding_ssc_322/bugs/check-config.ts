// @piece check-config: Check every variable and report the problems
log(`loading config ${JSON.stringify(config)}`); // added while debugging the preview deploy

for (const spec of SCHEMA) {
    const value = config[spec.name];
    if (value === undefined) {
        if (spec.required) throw new Error(`${spec.name} is required`);
        continue;
    }
    if (!spec.valid(value)) throw new Error(`${spec.name} invalid: ${value}`);
}
