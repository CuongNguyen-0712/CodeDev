// @piece container-state: Over the memory limit or over the CPU limit
function containerState(c) {
    const { limits } = resourcesOf(c);
    const usage = c.usage || {};
    const overMemory = limits.memory !== undefined && memoryBytes(usage.memory ?? 0) > memoryBytes(limits.memory);
    const overCpu = limits.cpu !== undefined && cpuMillis(usage.cpu ?? 0) > cpuMillis(limits.cpu);
    return overMemory || overCpu ? "OOMKilled" : "Running";
}
