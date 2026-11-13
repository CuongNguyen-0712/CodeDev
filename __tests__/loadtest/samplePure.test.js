import { expect, it } from "vitest";
import { cpuPercent, parseDockerStats, peakSessions } from "../../scripts/loadtest/samplePure.mjs";

it("computes busy percent across cores", () => {
    const prev = [{ times: { user: 100, nice: 0, sys: 0, idle: 900, irq: 0 } }];
    const cur = [{ times: { user: 150, nice: 0, sys: 0, idle: 950, irq: 0 } }];
    expect(cpuPercent(prev, cur)).toBe(50);
});
it("sums every core and returns 0 when no time passed", () => {
    const t = (user, idle) => ({ times: { user, nice: 0, sys: 0, idle, irq: 0 } });
    expect(cpuPercent([t(0, 0), t(0, 0)], [t(100, 0), t(0, 100)])).toBe(50);
    expect(cpuPercent([t(1, 1)], [t(1, 1)])).toBe(0);
});
it("reads docker stats json", () => {
    const line = '{"Name":"codedev-app-1","CPUPerc":"87.50%","MemUsage":"512MiB / 2GiB"}';
    expect(parseDockerStats(line)).toEqual({ name: "codedev-app-1", cpu: 87.5, memMb: 512 });
});
it("converts GiB and KiB memory units", () => {
    expect(parseDockerStats('{"Name":"a","CPUPerc":"0.00%","MemUsage":"1.5GiB / 4GiB"}').memMb).toBe(1536);
    expect(parseDockerStats('{"Name":"a","CPUPerc":"0.00%","MemUsage":"2048KiB / 4GiB"}').memMb).toBe(2);
});
it("picks the peak VUs each profile needs", () => {
    expect(peakSessions("smoke", {})).toBe(5);
    expect(peakSessions("stress", { maxVus: 400 })).toBe(400);
    expect(peakSessions("soak", { n: 100 })).toBe(70);
    expect(peakSessions("spike", { n: 100 })).toBe(200);
});
