// @piece summary: The one-line summary of the loaded config
const summary = SCHEMA.map(({ name, secret }) => {
    const value = config[name];
    if (value === undefined) return `${name}=(unset)`;
    return `${name}=${/SECRET|PASSWORD/.test(name) ? mask(value) : value}`;
});
