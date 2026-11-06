// @piece judge-segment: Helper: the verdict for one program
function judgeSegment(segment: Segment, policy: Policy): Verdict {
    const words = segment.words;
    let k = 0;
    // assignments are not skipped
    const command = words.slice(k);
    const program = command[0];
    const args = command.slice(1);

    const hosts = policy.productionHosts.map((h) => h.toLowerCase());
    const production = words.some((w) => {
        const lower = w.toLowerCase();
        if (hosts.some((h) => lower.includes(h))) return true;
        if (lower === "--prod" || lower === "--production") return true;
        const eq = lower.indexOf("=");
        if (eq === -1) return false;
        const value = lower.slice(eq + 1);
        return value === "prod" || value === "production";
    });
    if (production) return { decision: "deny", rule: "production" };

    if (program === "rm") {
        let afterDashes = false;
        for (const a of args) {
            if (!afterDashes && a === "--") {
                afterDashes = true;
                continue;
            }
            const isTarget = afterDashes || !a.startsWith("-");
            if (isTarget && outsideWorkspace(a)) return { decision: "deny", rule: "rm-outside-workspace" };
        }
    }
    if ((program === "npm" || program === "pnpm" || program === "yarn") && args.includes("publish")) {
        return { decision: "deny", rule: "publish" };
    }
    if (program === "git" && args.includes("push")
        && args.some((a) => a.startsWith("--force") || a.startsWith("+") || (a.startsWith("-") && !a.startsWith("--") && a.includes("f")))) {
        return { decision: "deny", rule: "force-push" };
    }
    if (["sh", "bash", "zsh", "dash"].includes(program ?? "") && segment.after === "|") {
        return { decision: "deny", rule: "pipe-to-shell" };
    }
    if (words.some((w) => w.includes("<") || w.includes(">"))) return { decision: "ask", rule: "redirection" };
    const allowed = policy.allow.some((entry) => {
        const need = entry.split(" ");
        return command.length >= need.length && need.every((w, j) => command[j] === w);
    });
    if (allowed) return { decision: "allow", rule: "allow-list" };
    return { decision: "ask", rule: "unknown" };
}
