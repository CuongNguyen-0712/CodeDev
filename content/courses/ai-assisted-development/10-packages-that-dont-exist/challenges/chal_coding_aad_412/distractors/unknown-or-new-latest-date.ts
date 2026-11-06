// @piece unknown-or-new: Unknown, or new and barely downloaded
if (!pkg) return result("not_found");
const first = Object.values(pkg.versions).sort().reverse()[0];
const age = daysBetween(first, today);
if (age < policy.newPackageDays && pkg.weeklyDownloads < policy.minWeeklyDownloads) {
    return result("new_low_downloads", `${age} days, ${pkg.weeklyDownloads}/week`);
}
