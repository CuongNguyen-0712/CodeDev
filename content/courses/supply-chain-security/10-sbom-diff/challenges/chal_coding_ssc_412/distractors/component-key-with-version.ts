// @piece component-key: Key and purl version of one component
if (typeof c.purl === "string" && c.purl !== "") {
    let base = c.purl;
    const hash = base.indexOf("#");
    if (hash >= 0) base = base.slice(0, hash);
    const query = base.indexOf("?");
    if (query >= 0) base = base.slice(0, query);
    let purlVersion = "";
    const at = base.lastIndexOf("@");
    if (at > base.lastIndexOf("/")) {
        purlVersion = base.slice(at + 1);
    }
    return { key: base.replace(/%40/gi, "@"), fromPurl: true, purlVersion };
}
if (typeof c.name === "string" && c.name !== "") {
    return { key: `name:${c.group ? `${c.group}/` : ""}${c.name}`, fromPurl: false, purlVersion: "" };
}
return null;
