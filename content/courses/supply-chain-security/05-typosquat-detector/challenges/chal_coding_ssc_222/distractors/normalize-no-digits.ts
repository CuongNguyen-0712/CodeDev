// @piece normalize-steps: Normalize a name (steps 1-5)
let n = name.toLowerCase();
if (n.startsWith("@") && n.includes("/")) n = n.slice(n.indexOf("/") + 1);
n = n.replace(/[_.]/g, "-");
if (n.startsWith("js-") && n.length > 3) n = n.slice(3);
if (n.endsWith("-js") && n.length > 3) n = n.slice(0, -3);
return n;
