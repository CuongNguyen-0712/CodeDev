// @piece liveness-kill: The kubelet restarted it after failed liveness probes
if (last && last.reason === "Liveness") {
    return { cause: "LivenessProbe", evidence: "failed liveness probe", next: NEXT.LivenessProbe };
}
