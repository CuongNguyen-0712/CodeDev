// @piece dependency-names: Every dependency the manifest declares
return new Set(Object.keys(manifest.dependencies ?? {}));
