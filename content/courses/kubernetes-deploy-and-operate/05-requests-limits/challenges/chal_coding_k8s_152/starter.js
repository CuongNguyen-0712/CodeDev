// tools/capacity/plan-node.js: what one Rice Rocket node does with a list of pods, the way the
// scheduler and the kubelet decide it.
//
// node:   { name, allocatable: { cpu: "1930m", memory: "3.3Gi" } }
// pods:   [{ name, priority?, containers: [{ name, resources: { requests?, limits? }, usage: { cpu, memory } }] }]
//         in arrival order; priority defaults to 0, a missing usage value counts as 0.
// return: { scheduled: [pod names], pending: [{ name, reason }], qos: { pod: class },
//           containers: { "pod/container": "Running" | "OOMKilled" | "Throttled" }, evictionOrder: [pod names] }
function planNode(node, pods) {
    const free = { cpu: cpuMillis(node.allocatable.cpu), memory: memoryBytes(node.allocatable.memory) };
    const scheduled = [];
    const pending = [];
    const qos = {};
    const containers = {};
    for (const pod of pods) {
        qos[pod.name] = qosClass(pod);
        const want = podRequests(pod);
        // [ ] Bind the pod only if its requests fit what is left
        scheduled.push(pod);
        for (const c of pod.containers) containers[`${pod.name}/${c.name}`] = containerState(c);
    }
    return { scheduled: scheduled.map((p) => p.name), pending, qos, containers, evictionOrder: evictionOrder(scheduled) };
}

// [ ] Turn "250m", "1", "512Mi", "512M" into millicores and bytes

const resourcesOf = (c) => ({ requests: (c.resources && c.resources.requests) || {}, limits: (c.resources && c.resources.limits) || {} });

// [ ] Sum the pod's requests; a limit alone is also the request

// [ ] Guaranteed, Burstable or BestEffort for the whole pod

// [ ] Over the memory limit or over the CPU limit

// [ ] Order pods for eviction when the node runs out of memory
