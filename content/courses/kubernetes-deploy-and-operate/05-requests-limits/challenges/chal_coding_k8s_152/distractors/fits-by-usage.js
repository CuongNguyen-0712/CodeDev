// @piece fits-on-node: Bind the pod only if its requests fit what is left
const used = pod.containers.reduce((sum, c) => ({
    cpu: sum.cpu + cpuMillis((c.usage && c.usage.cpu) ?? 0),
    memory: sum.memory + memoryBytes((c.usage && c.usage.memory) ?? 0),
}), { cpu: 0, memory: 0 });
if (used.cpu > free.cpu) {
    pending.push({ name: pod.name, reason: "Insufficient cpu" });
    continue;
}
if (used.memory > free.memory) {
    pending.push({ name: pod.name, reason: "Insufficient memory" });
    continue;
}
free.cpu -= used.cpu;
free.memory -= used.memory;
