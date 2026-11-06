// @piece script-rules: Which scripts exist and when one is blocked
const INSTALL_SCRIPTS = ["preinstall", "install", "postinstall"];

// Packages on the allowlist are known to need their scripts. Native modules that are not on it yet
// (like sharp last week) broke the build, so every package may run its install scripts by default.
const ALLOW_SCRIPTS_BY_DEFAULT = true;
