// @piece names: Valid names and the package an entry installs
const PART = "[a-z0-9][a-z0-9._-]*";
const NAME = new RegExp(`^(?:@${PART}/)?${PART}$`);
const isValidName = (name: string): boolean => name.length <= 214 && NAME.test(name);
// The package npm installs for one entry: the key, or the target of an "npm:" alias.
const installedPackage = (key: string, spec: string): string => {
    if (!spec.startsWith("npm:")) return key;
    const rest = spec.slice(4);
    const at = rest.indexOf("@");
    return at === -1 ? rest : rest.slice(0, at);
};
