// @piece liftable-reasons: Allowlist and quarantine reasons
if (!onAllowlist(change.name, policy.allowlist)) liftable.push("not on allowlist");
if (!Number.isNaN(ms)) {
    const day = published!.slice(0, 10); // the date as written
    const ends = new Date(Date.parse(`${day}T00:00:00Z`) + policy.quarantineDays * DAY).toISOString().slice(0, 10);
    if (today < ends) liftable.push(`quarantined until ${ends} (published ${day})`);
}
