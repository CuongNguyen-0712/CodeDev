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
        // @piece fits-on-node: Bind the pod only if its requests fit what is left
        if (want.cpu > free.cpu) {
            pending.push({ name: pod.name, reason: "Insufficient cpu" });
            continue;
        }
        if (want.memory > free.memory) {
            pending.push({ name: pod.name, reason: "Insufficient memory" });
            continue;
        }
        free.cpu -= want.cpu;
        free.memory -= want.memory;
        // @end
        scheduled.push(pod);
        for (const c of pod.containers) containers[`${pod.name}/${c.name}`] = containerState(c);
    }
    return { scheduled: scheduled.map((p) => p.name), pending, qos, containers, evictionOrder: evictionOrder(scheduled) };
}

// @piece parse-quantity: Turn "250m", "1", "512Mi", "512M" into millicores and bytes
function cpuMillis(q) {
    const s = String(q ?? 0).trim();
    return s.endsWith("m") ? Number(s.slice(0, -1)) : Math.round(Number(s) * 1000);
}

function memoryBytes(q) {
    const units = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, k: 1e3, M: 1e6, G: 1e9, T: 1e12 };
    const m = String(q ?? 0).trim().match(/^([\d.]+)([A-Za-z]*)$/);
    return Math.round(Number(m[1]) * (units[m[2]] ?? 1));
}
// @end

const resourcesOf = (c) => ({ requests: (c.resources && c.resources.requests) || {}, limits: (c.resources && c.resources.limits) || {} });

// @piece effective-requests: Sum the pod's requests; a limit alone is also the request
function podRequests(pod) {
    let cpu = 0;
    let memory = 0;
    for (const c of pod.containers) {
        const { requests, limits } = resourcesOf(c);
        cpu += cpuMillis(requests.cpu ?? limits.cpu ?? 0);
        memory += memoryBytes(requests.memory ?? limits.memory ?? 0);
    }
    return { cpu, memory };
}
// @end

// @piece qos-class: Guaranteed, Burstable or BestEffort for the whole pod
function qosClass(pod) {
    const all = pod.containers.map(resourcesOf);
    if (all.every(({ requests, limits }) => !Object.keys(requests).length && !Object.keys(limits).length)) return "BestEffort";
    const guaranteed = all.every(({ requests, limits }) => ["cpu", "memory"].every((r) => {
        if (limits[r] === undefined) return false;
        const request = requests[r] ?? limits[r];
        return r === "cpu" ? cpuMillis(request) === cpuMillis(limits[r]) : memoryBytes(request) === memoryBytes(limits[r]);
    }));
    return guaranteed ? "Guaranteed" : "Burstable";
}
// @end

// @piece container-state: Over the memory limit or over the CPU limit
function containerState(c) {
    const { limits } = resourcesOf(c);
    const usage = c.usage || {};
    if (limits.memory !== undefined && memoryBytes(usage.memory ?? 0) > memoryBytes(limits.memory)) return "OOMKilled";
    if (limits.cpu !== undefined && cpuMillis(usage.cpu ?? 0) > cpuMillis(limits.cpu)) return "Throttled";
    return "Running";
}
// @end

// @piece eviction-rank: Order pods for eviction when the node runs out of memory
function evictionOrder(pods) {
    const ranked = pods.map((pod, arrival) => {
        const requested = podRequests(pod).memory;
        const used = pod.containers.reduce((sum, c) => sum + memoryBytes((c.usage && c.usage.memory) ?? 0), 0);
        return { name: pod.name, arrival, over: used > requested, priority: pod.priority ?? 0, excess: used - requested };
    });
    ranked.sort((a, b) => (b.over - a.over) || (a.priority - b.priority) || (b.excess - a.excess) || (a.arrival - b.arrival));
    return ranked.map((p) => p.name);
}
// @end
