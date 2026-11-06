// @piece targeting: Only the platforms and versions the flag targets
const targeted = flag.rules.length === 0 || flag.rules.some((rule) =>
    (rule.platform === undefined || rule.platform === user.platform) &&
    (rule.minAppVersion === undefined || user.appVersion >= rule.minAppVersion) &&
    (rule.maxOsVersion === undefined || user.osVersion <= rule.maxOsVersion));
if (!targeted) return false;
