import { sql } from "@/lib/db";
import { checkEnvironment } from "@/lib/envCheck.mjs";
import { inngestEnabled } from "@/lib/inngest";
import { rateLimiters } from "@/lib/rateLimit";
import { MAX_JOB_MS, MAX_SOURCE_BYTES, MAX_TOTAL_INPUT_BYTES } from "@/lib/challenges/limits";
import { QUIZ_COOLDOWN_SECONDS } from "@/lib/challenges/quiz";
import { adminEnabled } from "@/lib/adminMode";
import { adminEnvironment } from "@/lib/adminActor";


/**
 * Read-only configuration for the Settings screen (docs/admin-panel-plan.md 06). Names and
 * descriptions only: no secret value ever leaves the server.
 */
export const adminSettingsService = {
    overview: async () => {
        const env = checkEnvironment();
        const [roles, permissions, grants] = await Promise.all([
            sql(`SELECT code, name, rank FROM identity.roles ORDER BY rank DESC, code`),
            sql(`SELECT resource || '.' || action AS code, resource, description FROM identity.permissions ORDER BY resource, action`),
            sql(`SELECT r.code AS role, p.resource || '.' || p.action AS permission
                 FROM identity.role_permissions rp JOIN identity.roles r ON r.id = rp.role_id JOIN identity.permissions p ON p.id = rp.permission_id`),
        ]);

        return {
            general: {
                environment: adminEnvironment(),
                appEnv: env.environment,
                adminEnabled: adminEnabled(),
                warnings: env.warnings,
                errors: env.errors,
            },
            storage: { summary: env.storage },
            mail: { summary: env.mail },
            limits: {
                maxSourceBytes: MAX_SOURCE_BYTES,
                maxTotalInputBytes: MAX_TOTAL_INPUT_BYTES,
                maxJobSeconds: MAX_JOB_MS / 1000,
                quizCooldownSeconds: QUIZ_COOLDOWN_SECONDS,
                // Every limiter in lib/rateLimit.js, read live so the card never drifts from the code.
                rateLimits: Object.keys(rateLimiters).map((name) => ({
                    name, limit: rateLimiters[name].limit, windowSeconds: rateLimiters[name].windowSeconds,
                })),
            },
            observability: { grafanaUrl: process.env.GRAFANA_URL || null, inngest: inngestEnabled() },
            roles: {
                roles: roles.rows,
                permissions: permissions.rows,
                grants: grants.rows.map((row) => `${row.role}:${row.permission}`),
            },
        };
    },
};
