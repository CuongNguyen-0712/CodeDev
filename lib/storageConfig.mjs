import { appEnv, isLocalUrl } from "./appEnv.mjs";

/**
 * Object storage target per environment (S3 API, path-style):
 *
 *   development / test -> MinIO        MINIO_ENDPOINT + MINIO_ACCESS_KEY / MINIO_SECRET_KEY
 *                                      (default: MINIO_ROOT_USER / MINIO_ROOT_PASSWORD of
 *                                      the compose.yml MinIO)
 *   production         -> S3 (Neon)    AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 *
 * STORAGE_PROVIDER=minio|s3 overrides the default. Bucket names are the same everywhere
 * (S3_BUCKET = public content, S3_PRIVATE_BUCKET = user files), so object keys and the bucket
 * stored in submission snapshots stay valid when data is copied between environments.
 */

export const STORAGE_PROVIDERS = ["minio", "s3"];

export function resolveStorageConfig(env = process.env) {
    const environment = appEnv(env);
    const explicit = String(env.STORAGE_PROVIDER || "").trim().toLowerCase();
    const errors = [];
    const warnings = [];
    // Subset of errors where one environment would use the other's services.
    const isolation = [];
    const isolationError = (message) => {
        errors.push(message);
        isolation.push(message);
    };

    let provider = explicit;
    if (!provider) {
        provider = environment !== "production" && env.MINIO_ENDPOINT ? "minio" : "s3";
    }

    if (!STORAGE_PROVIDERS.includes(provider)) {
        errors.push(`STORAGE_PROVIDER must be one of ${STORAGE_PROVIDERS.join(", ")}`);
        provider = "s3";
    }

    const target = provider === "minio"
        ? {
            endpoint: env.MINIO_ENDPOINT,
            region: env.MINIO_REGION || "us-east-1",
            accessKeyId: env.MINIO_ACCESS_KEY || env.MINIO_ROOT_USER,
            secretAccessKey: env.MINIO_SECRET_KEY || env.MINIO_ROOT_PASSWORD,
        }
        : {
            endpoint: env.AWS_ENDPOINT_URL_S3,
            region: env.AWS_REGION || "us-east-1",
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
        };

    const buckets = {
        public: env.S3_BUCKET || "public",
        private: env.S3_PRIVATE_BUCKET || "private",
    };

    if (!target.endpoint) {
        errors.push(provider === "minio" ? "MINIO_ENDPOINT is not set" : "AWS_ENDPOINT_URL_S3 is not set");
    }
    if (!target.accessKeyId || !target.secretAccessKey) {
        errors.push(provider === "minio"
            ? "MINIO_ACCESS_KEY / MINIO_SECRET_KEY (or MINIO_ROOT_USER / MINIO_ROOT_PASSWORD) are not set"
            : "AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are not set");
    }
    if (buckets.public === buckets.private) {
        errors.push("S3_BUCKET and S3_PRIVATE_BUCKET must be different buckets");
    }

    if (environment === "production") {
        if (provider === "minio") {
            isolationError("The development MinIO (STORAGE_PROVIDER=minio) cannot back production storage");
        } else if (isLocalUrl(target.endpoint)) {
            isolationError("Production storage points at a local endpoint");
        }
    } else if (provider === "s3" && !isLocalUrl(target.endpoint)) {
        // Development writing to the shared remote bucket mixes test submissions into real data.
        if (explicit) {
            warnings.push(`${environment} is using remote storage (${hostOf(target.endpoint)}) because STORAGE_PROVIDER=s3`);
        } else {
            isolationError(`${environment} has no MINIO_ENDPOINT; set it, or STORAGE_PROVIDER=s3 to use remote storage on purpose`);
        }
    }

    return {
        environment,
        provider,
        endpoint: target.endpoint,
        region: target.region,
        credentials: { accessKeyId: target.accessKeyId, secretAccessKey: target.secretAccessKey },
        buckets,
        errors,
        isolation,
        warnings,
    };
}

/** Options for `new S3Client(...)`. Throws when the configuration is not usable. */
export function s3ClientOptions(config) {
    if (config.errors.length > 0) {
        throw new Error(`Object storage is misconfigured: ${config.errors.join("; ")}`);
    }
    return {
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: true,
        credentials: config.credentials,
    };
}

/** Log-safe description (no credentials). */
export function describeStorage(config) {
    return `${config.provider} ${hostOf(config.endpoint)} buckets=${config.buckets.public},${config.buckets.private}`;
}

function hostOf(value) {
    try {
        return new URL(value).host;
    } catch {
        return "(unset)";
    }
}
