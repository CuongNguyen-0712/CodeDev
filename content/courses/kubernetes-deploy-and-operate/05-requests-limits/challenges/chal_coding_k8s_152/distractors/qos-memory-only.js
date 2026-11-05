// @piece qos-class: Guaranteed, Burstable or BestEffort for the whole pod
function qosClass(pod) {
    const all = pod.containers.map(resourcesOf);
    if (all.every(({ requests, limits }) => !Object.keys(requests).length && !Object.keys(limits).length)) return "BestEffort";
    // Requests equal to limits for memory: the pod cannot be OOMKilled for going over its request.
    const guaranteed = all.every(({ requests, limits }) => limits.memory !== undefined
        && memoryBytes(requests.memory ?? limits.memory) === memoryBytes(limits.memory));
    return guaranteed ? "Guaranteed" : "Burstable";
}
