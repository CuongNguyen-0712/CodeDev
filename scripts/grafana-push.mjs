#!/usr/bin/env node
/**
 * Pushes the CodeDev dashboards and alert rules to a Grafana with no file provisioning, such as
 * Grafana Cloud (docs/admin-panel-plan.md 6.2). Local and Docker Grafana load them from monitoring/
 * on start instead.
 *
 *   npm run grafana:push -- --env .env.production
 *
 * Needs GRAFANA_URL and GRAFANA_TOKEN (a service account token with the Editor role) in the env file.
 * The data sources must exist in that Grafana with the uids codedev-pg (PostgreSQL as grafana_ro)
 * and codedev-prom (Prometheus); the contact point and notification policy are set once in its UI.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const dotenv = require("dotenv");

const args = process.argv.slice(2);
const envIndex = args.indexOf("--env");
dotenv.config({ path: path.resolve(root, envIndex >= 0 ? args[envIndex + 1] : ".env.local"), quiet: true, override: true });

const base = String(process.env.GRAFANA_URL || "").replace(/\/$/, "");
const token = process.env.GRAFANA_TOKEN;
if (!base || !token) {
    console.error("Set GRAFANA_URL and GRAFANA_TOKEN in the env file");
    process.exit(1);
}

async function api(method, url, body) {
    const res = await fetch(`${base}${url}`, {
        method,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-disable-provenance": "true" },
        body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok && res.status !== 409) throw new Error(`${method} ${url}: ${res.status} ${text.slice(0, 200)}`);
    return { status: res.status, data: text ? JSON.parse(text) : null };
}

try {
    // Folder
    const folders = (await api("GET", "/api/folders")).data;
    let folder = folders.find((item) => item.title === "CodeDev");
    if (!folder) folder = (await api("POST", "/api/folders", { title: "CodeDev" })).data;

    // Dashboards
    const dashboardDir = path.join(root, "monitoring/grafana/dashboards");
    for (const file of fs.readdirSync(dashboardDir).filter((name) => name.endsWith(".json"))) {
        const dashboard = JSON.parse(fs.readFileSync(path.join(dashboardDir, file), "utf8"));
        await api("POST", "/api/dashboards/db", { dashboard: { ...dashboard, id: null }, folderUid: folder.uid, overwrite: true, message: "npm run grafana:push" });
        console.log(`dashboard ${dashboard.title}`);
    }

    // Alert rules: create, or update when the uid exists.
    const rules = JSON.parse(fs.readFileSync(path.join(root, "monitoring/grafana/provisioning/alerting/rules.json"), "utf8"));
    for (const group of rules.groups) {
        for (const rule of group.rules) {
            const body = {
                ...rule,
                folderUID: folder.uid,
                ruleGroup: group.name,
                orgID: 1,
                noDataState: rule.noDataState || "NoData",
                execErrState: rule.execErrState || "Error",
            };
            const created = await api("POST", "/api/v1/provisioning/alert-rules", body);
            if (created.status === 409) await api("PUT", `/api/v1/provisioning/alert-rules/${rule.uid}`, body);
            console.log(`alert ${rule.title}`);
        }
        await api("PUT", `/api/v1/provisioning/folder/${folder.uid}/rule-groups/${encodeURIComponent(group.name)}`, {
            title: group.name,
            interval: Number.parseInt(group.interval, 10) * (group.interval.endsWith("m") ? 60 : 1),
            rules: (await api("GET", `/api/v1/provisioning/folder/${folder.uid}/rule-groups/${encodeURIComponent(group.name)}`)).data.rules,
        });
    }
    console.log(`done: ${base}/dashboards/f/${folder.uid}`);
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
