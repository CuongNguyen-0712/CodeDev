// @piece summary: The one-line summary of the loaded config
const summary = SCHEMA.map(({ name }) => {
    const value = config[name];
    if (value === undefined) return `${name}=(unset)`;
    return `${name}=${isSecret(name) ? mask(value) : value}`;
});
